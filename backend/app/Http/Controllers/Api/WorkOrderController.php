<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use App\Models\WorkOrderMaterial;
use App\Models\WorkOrderPhoto;
use App\Services\Notifier;
use App\Support\Uploads;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WorkOrderController extends Controller
{
    private const PRIORITY_ORDER = "CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END";

    /** Admin sees all work orders; maintenance sees only those assigned to them. */
    public function index(Request $request)
    {
        $user = $request->user();

        $query = WorkOrder::with(['facility.parent', 'assignee:id,name', 'report:id,reference,photo']);

        if ($user->isMaintenance()) {
            $query->where('assigned_to', $user->id);
        }

        // scope=active → pending + in progress, scope=history → completed + cancelled
        if ($request->input('scope') === 'active') {
            $query->whereIn('status', WorkOrder::ACTIVE_STATUSES)
                ->orderByRaw(self::PRIORITY_ORDER)
                ->orderByRaw('due_date IS NULL, due_date');
        } elseif ($request->input('scope') === 'history') {
            $query->whereIn('status', ['completed', 'cancelled'])->orderByDesc('completed_at');
        }

        foreach (['status', 'priority', 'assigned_to', 'facility_id'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }

        if ($request->filled('search')) {
            $s = '%'.$request->input('search').'%';
            $query->where(fn ($q) => $q->where('title', 'like', $s)->orWhere('reference', 'like', $s));
        }

        return $query->latest()->paginate($request->integer('per_page', 20));
    }

    /** Admin creates a work order, either from a report (assignment) or on its own. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'report_id' => 'nullable|exists:reports,id',
            'facility_id' => 'nullable|exists:facilities,id',
            'title' => 'required_without:report_id|nullable|string|max:255',
            'description' => 'nullable|string|max:5000',
            'category' => ['nullable', Rule::in(Report::CATEGORIES)],
            'priority' => ['nullable', Rule::in(Report::PRIORITIES)],
            'assigned_to' => 'nullable|exists:users,id',
            'due_date' => 'nullable|date',
        ]);

        $this->ensureMaintenance($data['assigned_to'] ?? null);

        $report = isset($data['report_id']) ? Report::find($data['report_id']) : null;

        if ($report) {
            if ($report->activeWorkOrder) {
                throw ValidationException::withMessages([
                    'report_id' => "This report already has work order {$report->activeWorkOrder->reference}.",
                ]);
            }
            if ($report->status === 'completed') {
                throw ValidationException::withMessages(['report_id' => 'This report is already completed.']);
            }

            // Fill blanks from the report.
            $data['title'] = $data['title'] ?? $report->title;
            $data['description'] = $data['description'] ?? $report->description;
            $data['facility_id'] = $data['facility_id'] ?? $report->facility_id;
            $data['category'] = $data['category'] ?? $report->category;
            $data['priority'] = $data['priority'] ?? $report->priority;
        }

        $data['priority'] = $data['priority'] ?? 'medium';

        $wo = DB::transaction(function () use ($data, $report, $request) {
            $wo = WorkOrder::create([
                ...$data,
                'status' => 'pending',
                'created_by' => $request->user()->id,
                'assigned_at' => ! empty($data['assigned_to']) ? now() : null,
            ]);

            if ($report) {
                $report->update([
                    'status' => 'approved',
                    'priority' => $report->priority ?? $data['priority'],
                    'category' => $report->category ?? $data['category'],
                    'reviewed_by' => $report->reviewed_by ?? $request->user()->id,
                    'reviewed_at' => $report->reviewed_at ?? now(),
                ]);
            }

            return $wo;
        });

        $this->notifyAssignment($wo, $request->user());

        return response()->json($this->load($wo), 201);
    }

    public function show(Request $request, WorkOrder $workOrder)
    {
        $this->authorizeWork($request, $workOrder);

        return $this->load($workOrder);
    }

    /** Admin: edit details, reassign, or cancel. */
    public function update(Request $request, WorkOrder $workOrder)
    {
        $data = $request->validate([
            'facility_id' => 'nullable|exists:facilities,id',
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:5000',
            'category' => ['nullable', Rule::in(Report::CATEGORIES)],
            'priority' => ['sometimes', Rule::in(Report::PRIORITIES)],
            'assigned_to' => 'nullable|exists:users,id',
            'due_date' => 'nullable|date',
            'status' => ['sometimes', Rule::in(WorkOrder::STATUSES)],
        ]);

        $this->ensureMaintenance($data['assigned_to'] ?? null);

        $reassigned = array_key_exists('assigned_to', $data) && $data['assigned_to'] != $workOrder->assigned_to;
        if ($reassigned) {
            $data['assigned_at'] = $data['assigned_to'] ? now() : null;
        }

        // Keep timestamps consistent when the admin changes the status directly.
        if (isset($data['status']) && $data['status'] !== $workOrder->status) {
            if (in_array($data['status'], ['in_progress', 'completed']) && ! $workOrder->started_at) {
                $data['started_at'] = now();
            }
            if ($data['status'] === 'completed' && ! $workOrder->completed_at) {
                $data['completed_at'] = now();
            }
            if ($data['status'] === 'pending') {
                $data['started_at'] = null;
                $data['completed_at'] = null;
            }
            if ($data['status'] === 'in_progress') {
                $data['completed_at'] = null;
            }
        }

        $workOrder->update($data);

        if (isset($data['status'])) {
            $this->syncReport($workOrder);
        }
        if (isset($data['priority']) && $workOrder->report) {
            $workOrder->report->update(['priority' => $data['priority']]);
        }
        if ($reassigned) {
            $this->notifyAssignment($workOrder, $request->user());
        }
        if (($data['status'] ?? null) === 'cancelled' && $workOrder->assigned_to) {
            Notifier::send($workOrder->assigned_to, 'Work order cancelled',
                "{$workOrder->reference} \"{$workOrder->title}\" was cancelled.", 'assignment', null, $workOrder, $request->user());
        }

        return $this->load($workOrder->fresh());
    }

    public function destroy(WorkOrder $workOrder)
    {
        foreach ($workOrder->photos as $photo) {
            Uploads::delete($photo->path);
        }
        $report = $workOrder->report;
        $workOrder->delete();

        if ($report && in_array($report->status, ['in_progress', 'completed'])) {
            $report->update(['status' => 'approved']);
        }

        return response()->noContent();
    }

    /**
     * Maintenance (or admin): Pending → In Progress → Completed.
     * Completing requires the completion report (actions taken, remarks, date completed).
     */
    public function updateStatus(Request $request, WorkOrder $workOrder)
    {
        $this->authorizeWork($request, $workOrder, true);

        $data = $request->validate([
            'status' => ['required', Rule::in(['pending', 'in_progress', 'completed'])],
            'actions_taken' => 'required_if:status,completed|nullable|string|max:5000',
            'remarks' => 'nullable|string|max:5000',
            'completed_at' => 'nullable|date',
        ]);

        if ($workOrder->status === 'cancelled') {
            return response()->json(['message' => 'This work order was cancelled.'], 422);
        }

        $updates = ['status' => $data['status']];

        if ($data['status'] === 'in_progress') {
            $updates['started_at'] = $workOrder->started_at ?? now();
            $updates['completed_at'] = null;
        } elseif ($data['status'] === 'completed') {
            $updates['started_at'] = $workOrder->started_at ?? now();
            $updates['completed_at'] = $data['completed_at'] ?? now();
            $updates['actions_taken'] = $data['actions_taken'];
            $updates['remarks'] = $data['remarks'] ?? $workOrder->remarks;
        } else {
            $updates['started_at'] = null;
            $updates['completed_at'] = null;
        }

        $workOrder->update($updates);
        $this->syncReport($workOrder);

        $label = ['pending' => 'Pending', 'in_progress' => 'In Progress', 'completed' => 'Completed'][$data['status']];
        $recipients = Notifier::admins();
        if ($workOrder->report) {
            $recipients[] = $workOrder->report->user_id;
        }
        $recipients = array_diff($recipients, [$request->user()->id]);

        Notifier::send(
            $recipients,
            "Repair $label",
            "{$workOrder->reference} \"{$workOrder->title}\" is now $label".
                ($workOrder->assignee ? " (by {$workOrder->assignee->name})." : '.'),
            'status',
            $workOrder->report,
            $workOrder,
            $request->user(),
        );

        return $this->load($workOrder->fresh());
    }

    public function addPhoto(Request $request, WorkOrder $workOrder)
    {
        $this->authorizeWork($request, $workOrder, true);

        $data = $request->validate([
            'type' => ['required', Rule::in(['before', 'after'])],
            'photo' => 'required|image|max:8192',
        ]);

        $photo = $workOrder->photos()->create([
            'type' => $data['type'],
            'path' => Uploads::store($request->file('photo'), 'work-orders'),
            'uploaded_by' => $request->user()->id,
        ]);

        return response()->json($photo, 201);
    }

    public function deletePhoto(Request $request, WorkOrderPhoto $photo)
    {
        $this->authorizeWork($request, $photo->workOrder, true);

        Uploads::delete($photo->path);
        $photo->delete();

        return response()->noContent();
    }

    public function addMaterial(Request $request, WorkOrder $workOrder)
    {
        $this->authorizeWork($request, $workOrder, true);

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'type' => ['required', Rule::in(['material', 'equipment'])],
            'quantity' => 'required|numeric|min:0.01',
            'unit' => 'nullable|string|max:30',
            'unit_cost' => 'nullable|numeric|min:0',
        ]);

        return response()->json($workOrder->materials()->create($data), 201);
    }

    public function deleteMaterial(Request $request, WorkOrderMaterial $material)
    {
        $this->authorizeWork($request, $material->workOrder, true);

        $material->delete();

        return response()->noContent();
    }

    /** Maintenance personnel with their current workload, for the assignment picker. */
    public function personnel(Request $request)
    {
        return User::where('role', 'maintenance')
            ->where('is_active', true)
            ->withCount([
                'assignedWorkOrders as active_count' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES),
                'assignedWorkOrders as completed_count' => fn ($q) => $q->where('status', 'completed'),
            ])
            ->orderByDesc('is_available')
            ->orderBy('active_count')
            ->orderBy('name')
            ->get();
    }

    // ----------------------------------------------------------------------

    private function authorizeWork(Request $request, WorkOrder $wo, bool $modify = false): void
    {
        $user = $request->user();
        $allowed = $user->isAdmin() || ($user->isMaintenance() && (int) $wo->assigned_to === (int) $user->id);

        // Reporters may view the work order attached to their own report.
        if (! $modify && ! $allowed && $wo->report && (int) $wo->report->user_id === (int) $user->id) {
            $allowed = true;
        }

        abort_unless($allowed, 403, 'This work order is not assigned to you.');
    }

    private function ensureMaintenance(?int $userId): void
    {
        if ($userId && ! User::where('id', $userId)->where('role', 'maintenance')->exists()) {
            throw ValidationException::withMessages(['assigned_to' => 'Selected user is not maintenance personnel.']);
        }
    }

    /** Mirror the work order's progress on its report. */
    private function syncReport(WorkOrder $wo): void
    {
        $report = $wo->report;
        if (! $report) {
            return;
        }

        $status = match ($wo->status) {
            'in_progress' => 'in_progress',
            'completed' => 'completed',
            default => 'approved',
        };

        $report->update(['status' => $status]);
    }

    private function notifyAssignment(WorkOrder $wo, User $by): void
    {
        if (! $wo->assigned_to) {
            return;
        }

        $wo->load('assignee', 'facility', 'report');
        $where = $wo->facility ? " at {$wo->facility->full_name}" : '';

        Notifier::send(
            $wo->assigned_to,
            'New work order assigned',
            "{$wo->reference}: {$wo->title}$where. Priority: ".strtoupper($wo->priority).'.',
            'assignment',
            $wo->report,
            $wo,
            $by,
        );

        if ($wo->report) {
            Notifier::send(
                $wo->report->user_id,
                'Repair scheduled',
                "Your report {$wo->report->reference} was assigned to {$wo->assignee->name}.",
                'status',
                $wo->report,
                $wo,
                $by,
            );
        }
    }

    private function load(WorkOrder $wo): WorkOrder
    {
        return $wo->load([
            'facility.parent',
            'assignee:id,name,phone,specialization',
            'creator:id,name',
            'report.reporter:id,name,role,phone',
            'photos',
            'materials',
        ]);
    }
}
