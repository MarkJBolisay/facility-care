<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Equipment;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use App\Models\WorkOrderMaterial;
use App\Models\WorkOrderPhoto;
use App\Services\Notifier;
use App\Services\TechnicianMatcher;
use App\Support\Uploads;
use Carbon\Carbon;
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

        $query = WorkOrder::with(['facility.parent', 'assignee:id,name', 'report:id,reference,photo', 'equipment:id,code,name']);

        if ($user->isMaintenance()) {
            $query->where('assigned_to', $user->id);
        }

        // scope=active → open tasks, scope=tasks → everything assigned (incl. finished, except cancelled),
        // scope=history → completed + cancelled
        if ($request->input('scope') === 'active') {
            $query->whereIn('status', WorkOrder::ACTIVE_STATUSES)
                ->orderByRaw(self::PRIORITY_ORDER)
                ->orderByRaw('due_date IS NULL, due_date');
        } elseif ($request->input('scope') === 'tasks') {
            $query->where('status', '!=', 'cancelled')->latest();
        } elseif ($request->input('scope') === 'history') {
            $query->whereIn('status', ['completed', 'cancelled'])->orderByDesc('completed_at');
        }

        // attention=unassigned|overdue → open work orders that need the admin's action
        if ($request->input('attention') === 'unassigned') {
            $query->whereIn('status', WorkOrder::ACTIVE_STATUSES)->whereNull('assigned_to');
        } elseif ($request->input('attention') === 'overdue') {
            $query->whereIn('status', WorkOrder::ACTIVE_STATUSES)->whereDate('due_date', '<', today());
        }

        // status may be a comma list, e.g. in_progress,nearing_completion
        if ($request->filled('status')) {
            $query->whereIn('status', array_filter(explode(',', (string) $request->input('status'))));
        }
        foreach (['priority', 'assigned_to', 'type', 'equipment_id', 'category'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }
        // Location: a building includes all its rooms
        if ($request->filled('facility_id')) {
            $query->whereIn('facility_id', EquipmentController::facilityAndChildren((int) $request->input('facility_id')));
        }
        // Date created
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->input('to'));
        }

        if ($request->filled('search')) {
            $s = '%'.$request->input('search').'%';
            $query->where(fn ($q) => $q->where('title', 'like', $s)->orWhere('reference', 'like', $s)
                ->orWhereHas('equipment', fn ($e) => $e->where('code', 'like', $s)->orWhere('name', 'like', $s)));
        }

        return $query->latest()->paginate($request->integer('per_page', 20));
    }

    /** Admin creates a work order, either from a report (assignment) or on its own. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'report_id' => 'nullable|exists:reports,id',
            'facility_id' => 'nullable|exists:facilities,id',
            'equipment_id' => 'nullable|exists:equipment,id',
            'type' => ['nullable', Rule::in(WorkOrder::TYPES)],
            'title' => 'required_without:report_id|nullable|string|max:255',
            'description' => 'nullable|string|max:5000',
            'category' => ['nullable', Rule::in(Report::CATEGORIES)],
            'priority' => ['nullable', Rule::in(Report::PRIORITIES)],
            'assigned_to' => 'nullable|exists:users,id',
            'due_date' => 'nullable|date',
        ]);

        $this->ensureMaintenance($data['assigned_to'] ?? null);
        WorkOrder::assertDueDateNotPast($data['due_date'] ?? null);

        $report = isset($data['report_id']) ? Report::find($data['report_id']) : null;

        if ($report) {
            // a finished work order does not block a new one (the reporter may have reopened the request)
            $open = $report->workOrders()->whereIn('status', WorkOrder::ACTIVE_STATUSES)->latest()->first();
            if ($open) {
                throw ValidationException::withMessages([
                    'report_id' => "This report already has work order {$open->reference}.",
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
            $data['equipment_id'] = $data['equipment_id'] ?? $report->equipment_id;
        }

        $data['type'] = $data['type'] ?? 'corrective';
        if (! empty($data['equipment_id']) && empty($data['facility_id'])) {
            $data['facility_id'] = Equipment::find($data['equipment_id'])?->facility_id;
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

            // Start the timeline with the two stages that already happened.
            $wo->stages()->create([
                'stage' => 'reported',
                'remarks' => $report ? 'Request '.$report->reference.' submitted.' : 'Work order created.',
                'user_id' => $report?->user_id ?? $request->user()->id,
                'created_at' => $report?->created_at ?? now(),
            ]);
            $wo->stages()->create([
                'stage' => 'pending',
                'remarks' => 'Work order '.$wo->reference.' created'.($wo->assigned_to ? ' and assigned.' : '.'),
                'user_id' => $request->user()->id,
                'created_at' => now(),
            ]);

            ActivityLog::record('work_order_created', "Work order {$wo->reference} created".
                ($wo->due_date ? ', target date '.$wo->due_date->format('M j, Y') : '').'.', $request->user(), $report, $wo);

            return $wo;
        });

        if ($wo->assigned_to) {
            $wo->load('assignee');
            ActivityLog::record('assigned', "Assigned to {$wo->assignee->name}.", $request->user(), $report, $wo, to: $wo->assignee->name);
        }

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
            'equipment_id' => 'nullable|exists:equipment,id',
            'type' => ['sometimes', Rule::in(WorkOrder::TYPES)],
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:5000',
            'category' => ['nullable', Rule::in(Report::CATEGORIES)],
            'priority' => ['sometimes', Rule::in(Report::PRIORITIES)],
            'assigned_to' => 'nullable|exists:users,id',
            'due_date' => 'nullable|date',
            'status' => ['sometimes', Rule::in(WorkOrder::STATUSES)],
        ]);
        $before = $workOrder->only(['status', 'assigned_to', 'due_date', 'priority']);
        $oldAssignee = $workOrder->assignee?->name;

        // Stages are advanced through the repair workflow (with photo proof); only cancellation is a direct edit.
        if (isset($data['status']) && $data['status'] !== $workOrder->status && $data['status'] !== 'cancelled') {
            throw ValidationException::withMessages([
                'status' => 'Use Update repair status to move the job through its stages. A status cannot be skipped.',
            ]);
        }

        $this->ensureMaintenance($data['assigned_to'] ?? null);
        WorkOrder::assertDueDateNotPast($data['due_date'] ?? null, $workOrder->due_date?->toDateString());

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
        $by = $request->user();

        if ($reassigned) {
            $workOrder->load('assignee');
            ActivityLog::record('assigned', $workOrder->assignee ? "Reassigned to {$workOrder->assignee->name}." : 'Technician removed.',
                $by, workOrder: $workOrder, from: $oldAssignee, to: $workOrder->assignee?->name);
        }
        if (isset($data['status']) && $data['status'] !== $before['status']) {
            ActivityLog::record('status_changed', 'Status changed to '.EquipmentController::label($data['status']).'.',
                $by, workOrder: $workOrder, from: $before['status'], to: $data['status']);
            $this->syncEquipment($workOrder, $by);
        }
        if (array_key_exists('due_date', $data) && $workOrder->due_date?->toDateString() !== ($before['due_date'] ? $before['due_date']->toDateString() : null)) {
            ActivityLog::record('due_date_changed', 'Target date set to '.($workOrder->due_date?->format('M j, Y') ?? 'none').'.',
                $by, workOrder: $workOrder);
        }
        if (isset($data['priority']) && $data['priority'] !== $before['priority']) {
            ActivityLog::record('priority_changed', 'Priority set to '.ucfirst($data['priority']).'.', $by, workOrder: $workOrder,
                from: $before['priority'], to: $data['priority']);
        }

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

        if ($report && in_array($report->status, ['in_progress', 'nearing_completion', 'completed'])) {
            $report->update(['status' => 'approved']);
        }

        return response()->noContent();
    }

    /**
     * Legacy endpoint: stage changes now go through updateStage so every stage
     * carries its own remarks and photo proof. Kept so old clients get a clear message.
     */
    public function updateStatus(Request $request, WorkOrder $workOrder)
    {
        $this->authorizeWork($request, $workOrder, true);

        $data = $request->validate([
            'status' => ['required', Rule::in(WorkOrder::STATUSES)],
        ]);

        if ($data['status'] === $workOrder->status) {
            return $this->load($workOrder->fresh());
        }

        return response()->json([
            'message' => 'Update the repair through its stages. Every stage needs its own photo proof.',
        ], 422);
    }

    /**
     * Advance the repair one stage: In Progress → Nearing Completion → Completed.
     * A stage can't be skipped, repeated, or changed after completion, and each
     * submission needs a fresh photo (an earlier stage photo is never reused).
     */
    public function updateStage(Request $request, WorkOrder $workOrder)
    {
        $this->authorizeWork($request, $workOrder, true);
        $user = $request->user();

        $data = $request->validate([
            'stage' => ['required', Rule::in(['in_progress', 'nearing_completion', 'completed'])],
            'remarks' => 'nullable|string|max:1000',
            'photo' => 'required|image|max:8192',
            'actions_taken' => 'nullable|string|max:5000',
            'condition_after' => ['nullable', Rule::in(Equipment::CONDITIONS)],
            'no_materials_reason' => 'nullable|string|max:1000',
        ], [
            'photo.required' => 'Add a photo of this stage. Picture proof is required.',
            'photo.image' => 'The proof must be an image (JPG or PNG).',
            'photo.max' => 'The photo must be 8 MB or smaller.',
        ]);

        $stage = $data['stage'];

        if ($workOrder->status === 'cancelled') {
            return response()->json(['message' => 'This work order was cancelled.'], 422);
        }
        if ($workOrder->status === 'completed') {
            return response()->json(['message' => 'This repair is already completed. Ask the admin to reopen it.'], 422);
        }

        // Strictly one step at a time.
        $next = ['pending' => 'in_progress', 'in_progress' => 'nearing_completion', 'nearing_completion' => 'completed'][$workOrder->status] ?? null;
        if ($stage !== $next) {
            throw ValidationException::withMessages([
                'stage' => $workOrder->status === 'pending'
                    ? 'Start the repair before marking it nearing completion.'
                    : 'Finish the current stage first. Stages cannot be skipped.',
            ]);
        }

        // Duplicate submissions (double taps, retries) are rejected.
        if ($workOrder->stages()->where('stage', $stage)->exists()) {
            return response()->json(['message' => 'This stage was already submitted.'], 422);
        }

        if (in_array($stage, ['nearing_completion', 'completed']) && empty(trim((string) ($data['actions_taken'] ?? '')))) {
            throw ValidationException::withMessages(['actions_taken' => 'Describe the work done so far.']);
        }

        if ($stage === 'completed') {
            $materials = $workOrder->materials()->count();
            $reason = trim((string) ($data['no_materials_reason'] ?? $workOrder->no_materials_reason ?? ''));
            if ($materials === 0 && $reason === '') {
                throw ValidationException::withMessages([
                    'no_materials_reason' => 'Record the materials used, or choose "No materials used" and explain why.',
                ]);
            }
            if ($materials === 0 && mb_strlen($reason) < 5) {
                throw ValidationException::withMessages(['no_materials_reason' => 'Please explain why no materials were used.']);
            }
        }

        $photoPath = Uploads::store($request->file('photo'), 'stages');
        $fromStatus = $workOrder->status;

        DB::transaction(function () use ($workOrder, $stage, $data, $user, $photoPath, $fromStatus) {
            $updates = ['status' => $stage];
            if ($stage === 'in_progress') {
                $updates['started_at'] = $workOrder->started_at ?? now();
            }
            if ($stage === 'nearing_completion') {
                $updates['nearing_completion_at'] = now();
                $updates['actions_taken'] = $data['actions_taken'];
            }
            if ($stage === 'completed') {
                $updates['completed_at'] = now();
                $updates['completed_by'] = $user->id;
                $updates['started_at'] = $workOrder->started_at ?? now();
                $updates['actions_taken'] = $data['actions_taken'];
                $updates['remarks'] = $data['remarks'] ?? $workOrder->remarks;
                $updates['condition_after'] = $workOrder->equipment_id ? ($data['condition_after'] ?? 'operational') : null;
                if (! empty($data['no_materials_reason'])) {
                    $updates['no_materials_reason'] = $data['no_materials_reason'];
                }
            }

            $workOrder->update($updates);

            $workOrder->photos()->create([
                'type' => in_array($stage, ['nearing_completion', 'completed']) ? 'after' : 'before',
                'stage' => $stage,
                'remarks' => $data['remarks'] ?? null,
                'path' => $photoPath,
                'uploaded_by' => $user->id,
            ]);

            $workOrder->stages()->create([
                'stage' => $stage,
                'remarks' => $data['remarks'] ?? null,
                'user_id' => $user->id,
                'created_at' => now(),
            ]);

            $label = EquipmentController::label($stage);
            ActivityLog::record($stage === 'completed' ? 'completed' : 'status_changed',
                "Moved to $label.".(! empty($data['remarks']) ? ' Remarks: '.$data['remarks'] : ''),
                $user, $workOrder->report, $workOrder, from: $fromStatus, to: $stage);

            $this->syncReport($workOrder);
            $this->syncEquipment($workOrder, $user);

            $recipients = Notifier::admins();
            if ($workOrder->report) {
                $recipients[] = $workOrder->report->user_id;
            }
            $recipients = array_diff($recipients, [$user->id]);

            Notifier::send(
                $recipients,
                "Repair $label",
                "{$workOrder->reference} \"{$workOrder->title}\" is now $label".
                    ($workOrder->assignee ? " (by {$workOrder->assignee->name})." : '.'),
                'status',
                $workOrder->report,
                $workOrder,
                $user,
            );
        });

        return $this->load($workOrder->fresh());
    }

    public function addPhoto(Request $request, WorkOrder $workOrder)
    {
        $this->authorizeWork($request, $workOrder, true);

        $data = $request->validate([
            'type' => ['required', Rule::in(['before', 'after'])],
            'stage' => ['nullable', Rule::in(WorkOrder::STAGES)],
            'photo' => 'required|image|max:8192',
        ]);

        $photo = $workOrder->photos()->create([
            'type' => $data['type'],
            'stage' => $data['stage'] ?? ($workOrder->status === 'pending' ? 'reported' : $workOrder->status),
            'path' => Uploads::store($request->file('photo'), 'work-orders'),
            'uploaded_by' => $request->user()->id,
        ]);

        return response()->json($photo, 201);
    }

    public function deletePhoto(Request $request, WorkOrderPhoto $photo)
    {
        $this->authorizeWork($request, $photo->workOrder, true);

        // A completed repair keeps its proof photos.
        if ($photo->workOrder->status === 'completed' && ! $request->user()->isAdmin()) {
            return response()->json(['message' => 'Completed repairs keep their photo proof.'], 422);
        }

        Uploads::delete($photo->path);
        $photo->delete();

        return response()->noContent();
    }

    public function addMaterial(Request $request, WorkOrder $workOrder)
    {
        $this->authorizeWork($request, $workOrder, true);
        $this->ensureMaterialsOpen($workOrder);

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'type' => ['nullable', Rule::in(['material', 'equipment'])],
            'quantity' => 'required|numeric|min:0.01',
            'unit' => 'nullable|string|max:30',
            'unit_cost' => 'nullable|numeric|min:0',
            'purpose' => 'required|string|max:1000',
            'photo' => 'required|image|max:8192',
        ], [
            'purpose.required' => 'Describe what the material was used for.',
            'photo.required' => 'Add a photo of the material. Picture proof is required.',
        ]);

        // No duplicate entries for the same item, quantity and unit.
        $exists = $workOrder->materials()
            ->whereRaw('lower(name) = ?', [mb_strtolower(trim($data['name']))])
            ->where('quantity', $data['quantity'])
            ->where(fn ($q) => $q->where('unit', $data['unit'] ?? null)->orWhereNull('unit'))
            ->exists();
        if ($exists) {
            throw ValidationException::withMessages(['name' => 'This material is already recorded for this repair.']);
        }

        $material = $workOrder->materials()->create([
            'name' => trim($data['name']),
            'type' => $data['type'] ?? 'material',
            'quantity' => $data['quantity'],
            'unit' => $data['unit'] ?? null,
            'unit_cost' => $data['unit_cost'] ?? null,
            'purpose' => $data['purpose'],
            'photo' => Uploads::store($request->file('photo'), 'materials'),
            'added_by' => $request->user()->id,
            'used_at' => now(),
        ]);

        // Recording materials clears a previous "no materials used" note.
        if ($workOrder->no_materials_reason) {
            $workOrder->update(['no_materials_reason' => null]);
        }

        ActivityLog::record('material_added', "Material added: {$material->name} ({$material->quantity} {$material->unit}).",
            $request->user(), $workOrder->report, $workOrder);

        return response()->json($material->fresh(), 201);
    }

    public function updateMaterial(Request $request, WorkOrder $workOrder, WorkOrderMaterial $material)
    {
        $this->authorizeWork($request, $workOrder, true);
        $this->ensureMaterialsOpen($workOrder);
        abort_unless((int) $material->work_order_id === (int) $workOrder->id, 404);

        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'type' => ['sometimes', Rule::in(['material', 'equipment'])],
            'quantity' => 'sometimes|numeric|min:0.01',
            'unit' => 'nullable|string|max:30',
            'unit_cost' => 'nullable|numeric|min:0',
            'purpose' => 'sometimes|string|max:1000',
            'photo' => 'nullable|image|max:8192',
        ]);

        if ($request->hasFile('photo')) {
            Uploads::delete($material->photo);
            $data['photo'] = Uploads::store($request->file('photo'), 'materials');
        }
        if (isset($data['name'])) {
            $data['name'] = trim($data['name']);
        }

        // Keep the same "no duplicates" rule when a material is edited.
        $name = $data['name'] ?? $material->name;
        $quantity = $data['quantity'] ?? $material->quantity;
        $unit = array_key_exists('unit', $data) ? $data['unit'] : $material->unit;
        $duplicate = $workOrder->materials()
            ->where('id', '!=', $material->id)
            ->whereRaw('lower(name) = ?', [mb_strtolower($name)])
            ->where('quantity', $quantity)
            ->where(fn ($q) => $q->where('unit', $unit)->orWhereNull('unit'))
            ->exists();
        if ($duplicate) {
            throw ValidationException::withMessages(['name' => 'This material is already recorded for this repair.']);
        }

        $material->update($data);
        ActivityLog::record('material_updated', "Material updated: {$material->name}.",
            $request->user(), $workOrder->report, $workOrder);

        return response()->json($material->fresh());
    }

    public function deleteMaterial(Request $request, WorkOrderMaterial $material)
    {
        $this->authorizeWork($request, $material->workOrder, true);
        $this->ensureMaterialsOpen($material->workOrder);

        Uploads::delete($material->photo);
        $workOrder = $material->workOrder;
        $name = $material->name;
        $material->delete();

        ActivityLog::record('material_removed', "Material removed: $name.", $request->user(), $workOrder->report, $workOrder);

        return response()->noContent();
    }

    /** "No materials used" requires a written explanation. */
    public function noMaterials(Request $request, WorkOrder $workOrder)
    {
        $this->authorizeWork($request, $workOrder, true);
        $this->ensureMaterialsOpen($workOrder);

        $data = $request->validate([
            'reason' => 'required|string|min:5|max:1000',
        ], [
            'reason.required' => 'Explain why no materials were used.',
            'reason.min' => 'Please explain why no materials were used.',
        ]);

        if ($workOrder->materials()->exists()) {
            return response()->json(['message' => 'Remove the recorded materials before using "No materials used".'], 422);
        }

        $workOrder->update(['no_materials_reason' => $data['reason']]);
        ActivityLog::record('no_materials', "No materials used: {$data['reason']}", $request->user(), $workOrder->report, $workOrder);

        return $this->load($workOrder->fresh());
    }

    /** Materials can only be changed while the repair is still ongoing. */
    private function ensureMaterialsOpen(WorkOrder $workOrder): void
    {
        if (in_array($workOrder->status, ['completed', 'cancelled'], true)) {
            abort(422, 'Materials cannot be changed after the repair is completed.');
        }
        if (! in_array($workOrder->status, ['in_progress', 'nearing_completion'], true)) {
            abort(422, 'Start the repair before recording materials.');
        }
    }

    /**
     * Technicians ranked for a job (smart assignment): specialization, availability and workload.
     * Pass category, or equipment_id / report_id to work it out.
     */
    public function personnel(Request $request)
    {
        $category = $request->input('category');
        if (! $category && $request->filled('report_id')) {
            $report = Report::with('equipment')->find($request->input('report_id'));
            $category = $report?->category ?? $report?->equipment?->repairCategory();
        }
        if (! $category && $request->filled('equipment_id')) {
            $category = Equipment::find($request->input('equipment_id'))?->repairCategory();
        }

        return TechnicianMatcher::rank($category ?: null);
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

    /**
     * Keep the equipment's condition in step with its work order:
     * started → Under Maintenance · completed → the condition chosen in the completion report (and record the service date).
     */
    private function syncEquipment(WorkOrder $wo, User $by): void
    {
        $equipment = $wo->equipment;
        if (! $equipment) {
            return;
        }

        $old = $equipment->condition;
        $new = match ($wo->status) {
            'in_progress', 'nearing_completion' => 'under_maintenance',
            'completed' => $wo->condition_after ?: 'operational',
            'pending' => $wo->type === 'corrective' && $old === 'under_maintenance' ? 'needs_repair' : $old,
            default => $old,
        };

        $updates = [];
        if ($new !== $old) {
            $updates['condition'] = $new;
        }
        if ($wo->status === 'completed') {
            $updates['last_maintained_at'] = $wo->completed_at->toDateString();
        }
        if ($updates) {
            $equipment->update($updates);
        }
        if ($new !== $old) {
            ActivityLog::record('condition_changed', "{$equipment->code} is now ".EquipmentController::label($new).'.',
                $by, workOrder: $wo, equipment: $equipment, from: $old, to: $new);
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
            'nearing_completion' => 'nearing_completion',
            'completed' => 'completed',
            default => 'approved',
        };

        // a reporter's "it's fixed" only counts for a finished repair
        $report->update(['status' => $status, ...($status !== 'completed' ? ['confirmed_at' => null] : [])]);
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
            'equipment.facility.parent',
            'activities.user:id,name,role',
            'assignee:id,name,phone,specialization',
            'creator:id,name',
            'completer:id,name',
            'report.reporter:id,name,role,phone',
            'photos.uploader:id,name',
            'stages.user:id,name,role',
            'materials.uploader:id,name',
        ]);
    }
}
