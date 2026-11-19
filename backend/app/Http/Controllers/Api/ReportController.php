<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Equipment;
use App\Models\Report;
use App\Services\Notifier;
use App\Services\Priority;
use Illuminate\Pagination\LengthAwarePaginator;
use App\Support\Uploads;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    /** Admin sees all reports; students/faculty/staff see only their own. */
    public function index(Request $request)
    {
        $user = $request->user();

        $query = Report::with(['reporter:id,name,role', 'facility.parent', 'equipment:id,code,name,importance', 'activeWorkOrder.assignee:id,name'])
            ->latest();

        if (! $user->isAdmin()) {
            $query->where('user_id', $user->id);
        }

        foreach (['status', 'category', 'priority', 'severity', 'equipment_id'] as $field) {
            if ($request->filled($field)) {
                // several values can be given as a comma list, e.g. status=approved,in_progress
                $query->whereIn($field, explode(',', (string) $request->input($field)));
            }
        }

        // Location: a building includes all its rooms
        if ($request->filled('facility_id')) {
            $query->whereIn('facility_id', EquipmentController::facilityAndChildren((int) $request->input('facility_id')));
        }
        // Technician working on it
        if ($request->filled('assigned_to')) {
            $query->whereHas('workOrders', fn ($q) => $q->where('assigned_to', $request->input('assigned_to'))
                ->where('status', '!=', 'cancelled'));
        }
        // Date submitted
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->input('to'));
        }

        if ($request->filled('search')) {
            $s = '%'.$request->input('search').'%';
            $query->where(fn ($q) => $q->where('title', 'like', $s)
                ->orWhere('reference', 'like', $s)
                ->orWhere('description', 'like', $s)
                ->orWhereHas('equipment', fn ($e) => $e->where('code', 'like', $s)->orWhere('name', 'like', $s)));
        }

        $perPage = $request->integer('per_page', 20);

        // sort=score: highest recommended priority first (computed, so sorted in PHP)
        if ($request->input('sort') === 'score') {
            $all = $query->get()->each(fn ($r) => $r->priority_score = Priority::score($r))->sortByDesc('priority_score')->values();
            $page = max(1, $request->integer('page', 1));

            return new LengthAwarePaginator($all->forPage($page, $perPage)->values(), $all->count(), $perPage, $page);
        }

        $page = $query->paginate($perPage);
        $page->getCollection()->each(fn ($r) => $r->priority_score = Priority::score($r));

        return $page;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'facility_id' => 'nullable|exists:facilities,id',
            'location_details' => 'nullable|string|max:255',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:5000',
            'category' => ['nullable', Rule::in(Report::CATEGORIES)],
            // typed by the reporter when the category is "Others"
            'category_other' => 'nullable|string|max:100|required_if:category,others',
            'equipment_id' => 'nullable|exists:equipment,id',
            'severity' => ['nullable', Rule::in(Report::SEVERITIES)],
            // a photo of the problem is required
            'photo' => 'required|image|max:8192',
        ], [
            'photo.required' => 'Please add a photo of the issue.',
            'photo.image' => 'The photo must be an image (JPG or PNG).',
            'photo.max' => 'The photo must be 8 MB or smaller.',
        ]);

        // "Additional details" is optional on the form; the column is not nullable
        $data['description'] = $data['description'] ?? '';
        if (($data['category'] ?? null) !== 'others') {
            $data['category_other'] = null;
        }

        if ($request->hasFile('photo')) {
            $data['photo'] = Uploads::store($request->file('photo'), 'reports');
        }

        // Reporting a piece of equipment fills in its location and repair category.
        $equipment = ! empty($data['equipment_id']) ? Equipment::find($data['equipment_id']) : null;
        if ($equipment) {
            $data['facility_id'] = $data['facility_id'] ?? $equipment->facility_id;
            $data['category'] = $data['category'] ?? $equipment->repairCategory();
        }

        $report = Report::create([...$data, 'user_id' => $request->user()->id, 'status' => 'pending']);

        ActivityLog::record('submitted', "Request submitted by {$request->user()->name}.", $request->user(), $report);

        if ($equipment && $equipment->condition === 'operational') {
            $equipment->update(['condition' => 'needs_repair']);
            ActivityLog::record('condition_changed', "{$equipment->code} marked as Needs Repair because of {$report->reference}.",
                $request->user(), $report, equipment: $equipment, from: 'operational', to: 'needs_repair');
        }

        Notifier::send(
            Notifier::admins(),
            'New repair request',
            "{$request->user()->name} reported: {$report->title} ({$report->reference})".($equipment ? " — {$equipment->name}" : ''),
            'report',
            $report,
        );

        return response()->json($this->load($report), 201);
    }

    public function show(Request $request, Report $report)
    {
        $this->authorizeView($request, $report);

        $report = $this->load($report);
        if ($request->user()->isAdmin()) {
            $report->priority_assessment = Priority::assess($report);
            $report->possible_duplicates = $this->possibleDuplicates($report);
        }

        return $report;
    }

    /**
     * Other unfixed requests that look like the same problem:
     * the same equipment, or (when no equipment was picked) the same room and category.
     */
    private function possibleDuplicates(Report $report)
    {
        if (! in_array($report->status, Report::OPEN_STATUSES)) {
            return [];
        }

        $query = Report::whereKeyNot($report->id)->whereIn('status', Report::OPEN_STATUSES);
        if ($report->equipment_id) {
            $query->where('equipment_id', $report->equipment_id);
        } elseif ($report->facility_id && $report->category) {
            $query->whereNull('equipment_id')->where('facility_id', $report->facility_id)->where('category', $report->category);
        } else {
            return [];
        }

        return $query->with('reporter:id,name')->oldest()->limit(5)
            ->get(['id', 'reference', 'title', 'status', 'user_id', 'created_at']);
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
        $oldCategory = $report->category;
        // the typed "Others" text only belongs to the "others" category
        if (array_key_exists('category', $data) && $data['category'] !== 'others') {
            $data['category_other'] = null;
        }
        $report->update($data);

        if (array_key_exists('priority', $data) && $data['priority'] !== $oldPriority) {
            ActivityLog::record('priority_changed', 'Priority set to '.ucfirst($data['priority'] ?? 'none').'.',
                $request->user(), $report, from: $oldPriority, to: $data['priority']);
        }
        if (array_key_exists('category', $data) && $data['category'] !== $oldCategory) {
            ActivityLog::record('category_changed', 'Category set to '.EquipmentController::label($data['category'] ?? 'none').'.',
                $request->user(), $report, from: $oldCategory, to: $data['category']);
        }

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

        $from = $report->status;
        $report->update([
            ...array_filter($data, fn ($v) => $v !== null),
            ...(! empty($data['category']) && $data['category'] !== 'others' ? ['category_other' => null] : []),
            'status' => 'approved',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        ActivityLog::record('approved', 'Request approved'.($report->priority ? ' as '.ucfirst($report->priority).' priority' : '').'.',
            $request->user(), $report, from: $from, to: 'approved');

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

        if (in_array($report->status, ['in_progress', 'nearing_completion', 'completed'])) {
            return response()->json(['message' => 'This report is already being worked on.'], 422);
        }

        $report->update([
            'status' => 'rejected',
            'admin_remarks' => $data['admin_remarks'],
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        ActivityLog::record('rejected', "Request rejected: {$data['admin_remarks']}", $request->user(), $report, to: 'rejected');

        // Cancel any open work order for this report, and tell the technician it was cancelled.
        foreach ($report->workOrders()->where('status', 'pending')->get() as $wo) {
            $wo->update(['status' => 'cancelled']);
            ActivityLog::record('status_changed', 'Work order cancelled because the request was rejected.',
                $request->user(), $report, $wo, from: 'pending', to: 'cancelled');
            if ($wo->assigned_to) {
                Notifier::send($wo->assigned_to, 'Work order cancelled',
                    "{$wo->reference} \"{$wo->title}\" was cancelled because the request was rejected.",
                    'assignment', null, $wo, $request->user());
            }
        }

        // The report flagged its equipment "Needs Repair"; undo that if nothing else is open for it.
        $report->equipment?->releaseRepairFlag($report, $request->user(), 'rejected');

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

    /** Reporter: the repair worked. */
    public function confirm(Request $request, Report $report)
    {
        $this->ensureReporterCanAnswer($request, $report);

        $report->update(['confirmed_at' => now()]);
        ActivityLog::record('confirmed', "{$request->user()->name} confirmed the problem is fixed.", $request->user(), $report);

        if ($tech = $this->lastRepair($report)?->assigned_to) {
            Notifier::send($tech, 'Repair confirmed',
                "The reporter confirmed {$report->reference} \"{$report->title}\" is fixed. Thank you!",
                'status', $report, null, $request->user());
        }

        return $this->load($report->fresh());
    }

    /** Reporter: still broken after the repair. The request goes back to the admin to assign again. */
    public function reopen(Request $request, Report $report)
    {
        $data = $request->validate(['reason' => 'required|string|max:1000'], [
            'reason.required' => 'Tell us what is still wrong.',
        ]);
        $this->ensureReporterCanAnswer($request, $report);

        $report->update(['status' => 'approved', 'confirmed_at' => null, 'reopen_count' => $report->reopen_count + 1]);
        ActivityLog::record('reopened', "Reopened by {$request->user()->name}: still not fixed. \"{$data['reason']}\"",
            $request->user(), $report, from: 'completed', to: 'approved');

        $equipment = $report->equipment;
        if ($equipment && $equipment->condition === 'operational') {
            $equipment->update(['condition' => 'needs_repair']);
            ActivityLog::record('condition_changed', "{$equipment->code} marked as Needs Repair because {$report->reference} was reopened.",
                $request->user(), $report, equipment: $equipment, from: 'operational', to: 'needs_repair');
        }

        $message = "{$report->reference} \"{$report->title}\" is still not fixed: {$data['reason']}";
        Notifier::send(Notifier::admins(), 'Request reopened', "$message Please assign it again.", 'report', $report, null, $request->user());
        if ($tech = $this->lastRepair($report)?->assigned_to) {
            Notifier::send($tech, 'Repair reopened', $message, 'status', $report, null, $request->user());
        }

        return $this->load($report->fresh());
    }

    /** Only the person who reported it can answer, and only once the repair is done and not yet confirmed. */
    private function ensureReporterCanAnswer(Request $request, Report $report): void
    {
        abort_unless((int) $report->user_id === (int) $request->user()->id, 403, 'Only the person who reported this can answer.');
        if ($report->status !== 'completed' || $report->confirmed_at) {
            abort(422, $report->confirmed_at ? 'You already confirmed this repair.' : 'This request is not completed yet.');
        }
    }

    private function lastRepair(Report $report): ?\App\Models\WorkOrder
    {
        return $report->workOrders()->where('status', 'completed')->latest('completed_at')->first();
    }

    public function destroy(Request $request, Report $report)
    {
        $user = $request->user();

        // Reporters may withdraw their own report while it's still pending.
        if (! $user->isAdmin() && ! ((int) $report->user_id === (int) $user->id && $report->status === 'pending')) {
            abort(403, 'You cannot delete this report.');
        }

        $equipment = $report->equipment;
        $why = (int) $report->user_id === (int) $user->id ? 'withdrawn' : 'deleted';

        Uploads::delete($report->photo);
        $report->delete();

        // The report flagged its equipment "Needs Repair"; undo that if nothing else is open for it.
        $equipment?->releaseRepairFlag($report, $user, $why);

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
            'equipment.facility.parent',
            'reviewer:id,name',
            'workOrders' => fn ($q) => $q->latest()->with([
                'assignee:id,name,phone,specialization',
                'photos.uploader:id,name',
                'stages.user:id,name,role',
                'materials.uploader:id,name',
            ]),
            'activities.user:id,name,role',
        ]);
    }
}
