<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Equipment;
use App\Models\Facility;
use App\Models\Report;
use App\Models\WorkOrder;
use App\Support\Counts;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FacilityController extends Controller
{
    /** Everyone can list facilities (needed when submitting a report). */
    public function index(Request $request)
    {
        $query = Facility::with('parent')
            ->withCount([
                'reports as open_reports_count' => fn ($q) => $q->whereIn('status', ['pending', 'approved', 'in_progress']),
                'workOrders as total_work_orders_count',
            ])
            ->orderByRaw("CASE type WHEN 'building' THEN 0 ELSE 1 END")
            ->orderBy('name');

        foreach (['type', 'status', 'parent_id'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }

        if ($request->filled('search')) {
            $s = '%'.$request->input('search').'%';
            $query->where(fn ($q) => $q->where('name', 'like', $s)->orWhere('code', 'like', $s));
        }

        return $query->get();
    }

    public function store(Request $request)
    {
        $facility = Facility::create($this->validated($request));

        return response()->json($facility->load('parent'), 201);
    }

    public function show(Facility $facility)
    {
        return $facility->load(['parent', 'children']);
    }

    public function update(Request $request, Facility $facility)
    {
        $facility->update($this->validated($request, $facility));

        return $facility->load('parent');
    }

    public function destroy(Facility $facility)
    {
        if ($facility->children()->exists()) {
            return response()->json(['message' => 'Remove or move the rooms inside this building first.'], 422);
        }

        // Deleting would blank the location on old reports and leave equipment without a place.
        $has = Counts::describe([
            'report' => Report::where('facility_id', $facility->id)->count(),
            'work order' => WorkOrder::where('facility_id', $facility->id)->count(),
            'equipment' => Equipment::where('facility_id', $facility->id)->count(),
        ]);
        if ($has) {
            return response()->json([
                'message' => "{$facility->name} has $has. Set its status to Closed instead so its history is kept.",
                'can_close' => true,
            ], 422);
        }

        $facility->delete();

        return response()->noContent();
    }

    /** Previous issues and repairs for a facility (and the rooms inside it, if it's a building). */
    public function history(Facility $facility)
    {
        $ids = $facility->children()->pluck('id')->push($facility->id);

        $reports = Report::with(['reporter:id,name', 'facility'])
            ->whereIn('facility_id', $ids)
            ->latest()
            ->get();

        $workOrders = WorkOrder::with(['assignee:id,name', 'facility', 'materials'])
            ->whereIn('facility_id', $ids)
            ->latest()
            ->get();

        $completed = $workOrders->where('status', 'completed');

        return [
            'facility' => $facility->load(['parent', 'children']),
            'summary' => [
                'total_reports' => $reports->count(),
                'open_reports' => $reports->whereIn('status', ['pending', 'approved', 'in_progress'])->count(),
                'total_repairs' => $workOrders->count(),
                'completed_repairs' => $completed->count(),
                'materials_cost' => round($workOrders->sum('materials_cost'), 2),
                'last_repair' => $completed->sortByDesc('completed_at')->first()?->completed_at,
            ],
            'reports' => $reports,
            'work_orders' => $workOrders,
        ];
    }

    private function validated(Request $request, ?Facility $facility = null): array
    {
        return $request->validate([
            'code' => ['nullable', 'string', 'max:50', Rule::unique('facilities')->ignore($facility?->id)],
            'name' => 'required|string|max:255',
            'type' => ['required', Rule::in(Facility::TYPES)],
            'parent_id' => [
                'nullable',
                Rule::exists('facilities', 'id')->where('type', 'building'),
                Rule::notIn(array_filter([$facility?->id])),
            ],
            'floor' => 'nullable|string|max:50',
            'capacity' => 'nullable|integer|min:0',
            'description' => 'nullable|string|max:2000',
            'status' => ['required', Rule::in(Facility::STATUSES)],
        ]);
    }
}
