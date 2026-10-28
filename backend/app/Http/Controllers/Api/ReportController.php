<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Report;
use App\Services\Notifier;
use App\Support\Uploads;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    /** Admin sees all reports; students/faculty/staff see only their own. */
    public function index(Request $request)
    {
        $user = $request->user();

        $query = Report::with(['reporter:id,name,role', 'facility.parent', 'activeWorkOrder.assignee:id,name'])
            ->latest();

        if (! $user->isAdmin()) {
            $query->where('user_id', $user->id);
        }

        foreach (['status', 'category', 'priority', 'facility_id'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }

        if ($request->filled('search')) {
            $s = '%'.$request->input('search').'%';
            $query->where(fn ($q) => $q->where('title', 'like', $s)
                ->orWhere('reference', 'like', $s)
                ->orWhere('description', 'like', $s));
        }

        return $query->paginate($request->integer('per_page', 20));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'facility_id' => 'nullable|exists:facilities,id',
            'location_details' => 'nullable|string|max:255',
            'title' => 'required|string|max:255',
            'description' => 'required|string|max:5000',
            'category' => ['nullable', Rule::in(Report::CATEGORIES)],
            'photo' => 'nullable|image|max:8192',
        ]);

        if ($request->hasFile('photo')) {
            $data['photo'] = Uploads::store($request->file('photo'), 'reports');
        }

        $report = Report::create([...$data, 'user_id' => $request->user()->id, 'status' => 'pending']);

        Notifier::send(
            Notifier::admins(),
            'New facility report',
            "{$request->user()->name} reported: {$report->title} ({$report->reference})",
            'report',
            $report,
        );

        return response()->json($this->load($report), 201);
    }

    public function show(Request $request, Report $report)
    {
        $this->authorizeView($request, $report);

        return $this->load($report);
    }

    /** Admin: categorize, set priority, fix the facility. */
    public function update(Request $request, Report $report)
    {
        $data = $request->validate([
            'facility_id' => 'nullable|exists:facilities,id',
            'location_details' => 'nullable|string|max:255',
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|string|max:5000',
            'category' => ['nullable', Rule::in(Report::CATEGORIES)],
            'priority' => ['nullable', Rule::in(Report::PRIORITIES)],
            'admin_remarks' => 'nullable|string|max:2000',
        ]);

        $oldPriority = $report->priority;
        $report->update($data);

        // Keep the work order's priority in step with the report.
        if (array_key_exists('priority', $data) && $data['priority'] && $report->activeWorkOrder) {
            $report->activeWorkOrder->update(['priority' => $data['priority']]);
        }

        if (array_key_exists('priority', $data) && $data['priority'] !== $oldPriority && $data['priority']) {
            Notifier::send(
                $report->user_id,
                'Report priority updated',
                "Your report {$report->reference} is now marked ".strtoupper($data['priority']).' priority.',
                'status',
                $report,
                null,
                $request->user(),
            );
        }

        return $this->load($report->fresh());
    }

    public function approve(Request $request, Report $report)
    {
        $data = $request->validate([
            'category' => ['nullable', Rule::in(Report::CATEGORIES)],
            'priority' => ['nullable', Rule::in(Report::PRIORITIES)],
            'admin_remarks' => 'nullable|string|max:2000',
        ]);

        if (! in_array($report->status, ['pending', 'rejected'])) {
            return response()->json(['message' => 'Only pending or rejected reports can be approved.'], 422);
        }

        $report->update([
            ...array_filter($data, fn ($v) => $v !== null),
            'status' => 'approved',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        Notifier::send(
            $report->user_id,
            'Report approved',
            "Your report {$report->reference} \"{$report->title}\" was approved and will be scheduled for repair.",
            'status',
            $report,
            null,
            $request->user(),
        );

        return $this->load($report->fresh());
    }

    public function reject(Request $request, Report $report)
    {
        $data = $request->validate([
            'admin_remarks' => 'required|string|max:2000',
        ]);

        if (in_array($report->status, ['in_progress', 'completed'])) {
            return response()->json(['message' => 'This report is already being worked on.'], 422);
        }

        $report->update([
            'status' => 'rejected',
            'admin_remarks' => $data['admin_remarks'],
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        // Cancel any open work order for this report.
        $report->workOrders()->whereIn('status', ['pending'])->update(['status' => 'cancelled']);

        Notifier::send(
            $report->user_id,
            'Report rejected',
            "Your report {$report->reference} was rejected. Reason: {$data['admin_remarks']}",
            'status',
            $report,
            null,
            $request->user(),
        );

        return $this->load($report->fresh());
    }

    public function destroy(Request $request, Report $report)
    {
        $user = $request->user();

        // Reporters may withdraw their own report while it's still pending.
        if (! $user->isAdmin() && ! ((int) $report->user_id === (int) $user->id && $report->status === 'pending')) {
            abort(403, 'You cannot delete this report.');
        }

        Uploads::delete($report->photo);
        $report->delete();

        return response()->noContent();
    }

    private function authorizeView(Request $request, Report $report): void
    {
        $user = $request->user();
        $allowed = $user->isAdmin()
            || (int) $report->user_id === (int) $user->id
            || ($user->isMaintenance() && $report->workOrders()->where('assigned_to', $user->id)->exists());

        abort_unless($allowed, 403, 'You cannot view this report.');
    }

    private function load(Report $report): Report
    {
        return $report->load([
            'reporter:id,name,email,role,department,phone',
            'facility.parent',
            'reviewer:id,name',
            'workOrders' => fn ($q) => $q->latest()->with('assignee:id,name,phone'),
        ]);
    }
}
