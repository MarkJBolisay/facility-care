<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Equipment;
use App\Models\Facility;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use App\Services\Notifier;
use App\Services\TechnicianMatcher;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Equipment profiles, categories and conditions, maintenance history, and preventive maintenance.
 */
class EquipmentController extends Controller
{
    /** Search and filter: search, category, condition, facility_id (a building includes its rooms), department, maintenance. */
    public function index(Request $request)
    {
        $query = Equipment::with([
            'facility.parent',
            // only the reference and status, so reporters can see it is already reported without seeing who reported it
            'openReport' => fn ($q) => $q->select('reports.id', 'reports.equipment_id', 'reports.reference', 'reports.status', 'reports.created_at'),
        ])
            ->withCount(['reports as open_requests_count' => fn ($q) => $q->whereIn('status', Report::OPEN_STATUSES)]);

        foreach (['category', 'condition', 'department', 'importance'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }

        if ($request->filled('facility_id')) {
            $query->whereIn('facility_id', self::facilityAndChildren((int) $request->input('facility_id')));
        }

        if ($request->filled('search')) {
            $s = '%'.$request->input('search').'%';
            $query->where(fn ($q) => $q->where('name', 'like', $s)
                ->orWhere('code', 'like', $s)
                ->orWhere('serial_number', 'like', $s)
                ->orWhere('model', 'like', $s));
        }

        $items = $query->orderBy('name')->get();

        // maintenance=overdue|due_soon|scheduled is a computed field, so filter after loading
        if ($request->filled('maintenance')) {
            $want = $request->input('maintenance');
            $items = $items->filter(fn ($e) => $want === 'due'
                ? in_array($e->maintenance_state, ['overdue', 'due_soon'])
                : $e->maintenance_state === $want)->values();
        }

        return $items;
    }

    /** Counts per condition and category, for the equipment page header and the dashboard. */
    public function summary()
    {
        $all = Equipment::all();

        return [
            'total' => $all->count(),
            'by_condition' => collect(Equipment::CONDITIONS)->mapWithKeys(fn ($c) => [$c => $all->where('condition', $c)->count()]),
            'by_category' => $all->groupBy('category')->map->count()->sortDesc(),
            'maintenance' => [
                'overdue' => $all->where('maintenance_state', 'overdue')->count(),
                'due_soon' => $all->where('maintenance_state', 'due_soon')->count(),
                'scheduled' => $all->where('maintenance_state', 'scheduled')->count(),
            ],
        ];
    }

    public function store(Request $request)
    {
        $equipment = Equipment::create($this->validated($request));

        ActivityLog::record('equipment_added', "Equipment {$equipment->code} \"{$equipment->name}\" was added.",
            $request->user(), equipment: $equipment);

        return response()->json($this->load($equipment), 201);
    }

    public function show(Equipment $equipment)
    {
        return $this->load($equipment);
    }

    /** Everything needed for the equipment profile page: profile, history, open requests, activity. */
    public function history(Equipment $equipment)
    {
        $workOrders = $equipment->workOrders()
            ->with(['assignee:id,name', 'materials', 'report:id,reference,title,description,severity'])
            ->latest()->get();

        $completed = $workOrders->where('status', 'completed');

        return [
            'equipment' => $this->load($equipment),
            'summary' => [
                'total_requests' => $equipment->reports()->count(),
                'open_requests' => $equipment->reports()->whereIn('status', ['pending', 'approved', 'in_progress'])->count(),
                'repairs_completed' => $completed->where('type', 'corrective')->count(),
                'services_completed' => $completed->where('type', 'preventive')->count(),
                'materials_cost' => round($completed->sum('materials_cost'), 2),
                'last_service' => $completed->max('completed_at')?->toDateString(),
            ],
            'work_orders' => $workOrders->values(),
            'reports' => $equipment->reports()->with('reporter:id,name,role')->latest()->get(),
            'activity' => $equipment->activities()->with('user:id,name,role')->latest('created_at')->latest('id')->limit(50)->get(),
        ];
    }

    public function update(Request $request, Equipment $equipment)
    {
        $data = $this->validated($request, $equipment);
        $oldCondition = $equipment->condition;

        $equipment->update($data);

        if ($equipment->condition !== $oldCondition) {
            ActivityLog::record('condition_changed',
                "Condition of {$equipment->code} changed to ".self::label($equipment->condition).'.',
                $request->user(), equipment: $equipment, from: $oldCondition, to: $equipment->condition);
        } else {
            ActivityLog::record('equipment_updated', "Equipment {$equipment->code} details were updated.",
                $request->user(), equipment: $equipment);
        }

        return $this->load($equipment->fresh());
    }

    public function destroy(Equipment $equipment)
    {
        $equipment->delete();

        return response()->noContent();
    }

    /** Equipment with a preventive schedule, most urgent first. */
    public function preventive()
    {
        $items = Equipment::with('facility.parent')
            ->whereNotNull('maintenance_interval_days')
            ->with(['workOrders' => fn ($q) => $q->where('type', 'preventive')
                ->whereIn('status', WorkOrder::ACTIVE_STATUSES)->with('assignee:id,name')])
            ->get()
            ->map(function ($e) {
                $e->open_work_order = $e->workOrders->first();
                $e->unsetRelation('workOrders');

                return $e;
            })
            ->sortBy('next_maintenance_due')
            ->values();

        return [
            'overdue' => $items->where('maintenance_state', 'overdue')->values(),
            'due_soon' => $items->where('maintenance_state', 'due_soon')->values(),
            'scheduled' => $items->where('maintenance_state', 'scheduled')->values(),
        ];
    }

    /** Create a preventive maintenance work order for this equipment (recommended technician if none given). */
    public function schedule(Request $request, Equipment $equipment)
    {
        $data = $request->validate([
            'assigned_to' => 'nullable|exists:users,id',
            'due_date' => 'nullable|date',
            'priority' => ['nullable', Rule::in(Report::PRIORITIES)],
        ]);

        WorkOrder::assertDueDateNotPast($data['due_date'] ?? null);

        $open = $equipment->workOrders()->where('type', 'preventive')->whereIn('status', WorkOrder::ACTIVE_STATUSES)->first();
        if ($open) {
            return response()->json(['message' => "Already scheduled as {$open->reference}."], 422);
        }

        $category = $equipment->repairCategory();
        $techId = $data['assigned_to'] ?? TechnicianMatcher::rank($category)->first()?->id;
        if ($techId && ! User::where('id', $techId)->where('role', 'maintenance')->exists()) {
            return response()->json(['message' => 'Selected user is not a technician.'], 422);
        }

        $due = $data['due_date'] ?? max($equipment->next_maintenance_due ?? today()->toDateString(), today()->toDateString());

        $wo = WorkOrder::create([
            'equipment_id' => $equipment->id,
            'facility_id' => $equipment->facility_id,
            'title' => "Preventive maintenance: {$equipment->name}",
            'description' => "Scheduled servicing of {$equipment->code} ({$equipment->name}). Check condition, clean, test and record parts replaced.",
            'category' => $category,
            'type' => 'preventive',
            'priority' => $data['priority'] ?? ($equipment->maintenance_state === 'overdue' ? 'high' : 'medium'),
            'status' => 'pending',
            'assigned_to' => $techId,
            'assigned_at' => $techId ? now() : null,
            'created_by' => $request->user()->id,
            'due_date' => $due,
        ]);

        ActivityLog::record('scheduled', "Preventive maintenance {$wo->reference} scheduled for ".date('M j, Y', strtotime($due)).'.',
            $request->user(), workOrder: $wo, equipment: $equipment);

        if ($techId) {
            $wo->load('assignee');
            ActivityLog::record('assigned', "Assigned to {$wo->assignee->name}.", $request->user(), workOrder: $wo, to: $wo->assignee->name);
            Notifier::send($techId, 'Preventive maintenance assigned',
                "{$wo->reference}: {$wo->title}. Due ".date('M j', strtotime($due)).'.', 'assignment', null, $wo, $request->user());
        }

        return response()->json($wo->load(['assignee:id,name', 'equipment']), 201);
    }

    // ----------------------------------------------------------------------

    /** @return array<int> the facility id plus the ids of its rooms (for a building) */
    public static function facilityAndChildren(int $id): array
    {
        return array_merge([$id], Facility::where('parent_id', $id)->pluck('id')->all());
    }

    public static function label(string $value): string
    {
        return ucwords(str_replace('_', ' ', $value));
    }

    private function validated(Request $request, ?Equipment $equipment = null): array
    {
        $partial = $equipment ? 'sometimes|' : '';

        $data = $request->validate([
            'code' => ['nullable', 'string', 'max:50', Rule::unique('equipment', 'code')->ignore($equipment?->id)],
            'name' => $partial.'required|string|max:255',
            'category' => [$equipment ? 'sometimes' : 'required', Rule::in(Equipment::CATEGORIES)],
            'model' => 'nullable|string|max:255',
            'serial_number' => 'nullable|string|max:255',
            'department' => 'nullable|string|max:255',
            'facility_id' => 'nullable|exists:facilities,id',
            'acquisition_date' => 'nullable|date',
            'condition' => ['sometimes', Rule::in(Equipment::CONDITIONS)],
            'importance' => ['sometimes', Rule::in(Equipment::IMPORTANCE)],
            'maintenance_interval_days' => 'nullable|integer|min:1|max:3650',
            'last_maintained_at' => 'nullable|date',
            'notes' => 'nullable|string|max:5000',
        ]);

        // A blank Equipment ID means "generate one" (EQ-0001, ...)
        if (array_key_exists('code', $data) && blank($data['code'])) {
            unset($data['code']);
        }

        return $data;
    }

    private function load(Equipment $equipment): Equipment
    {
        return $equipment->load('facility.parent');
    }
}
