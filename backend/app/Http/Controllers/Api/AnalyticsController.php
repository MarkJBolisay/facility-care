<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Equipment;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use App\Models\WorkOrderMaterial;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Monthly, quarterly, yearly and custom date-range reports.
 */
class AnalyticsController extends Controller
{
    public function __invoke(Request $request)
    {
        $data = $request->validate([
            'period' => ['required', Rule::in(['monthly', 'quarterly', 'yearly', 'custom'])],
            'year' => 'nullable|integer|min:2000|max:2100',
            'month' => 'nullable|integer|min:1|max:12',
            'quarter' => 'nullable|integer|min:1|max:4',
            'from' => 'required_if:period,custom|nullable|date',
            'to' => 'required_if:period,custom|nullable|date|after_or_equal:from',
        ]);

        [$from, $to, $label] = $this->range($data);

        $reports = Report::with(['facility.parent', 'equipment:id,code,name'])->whereBetween('created_at', [$from, $to])->get();

        // Work orders completed inside the range (with their report for resolution time)
        $completed = WorkOrder::with(['assignee:id,name', 'report:id,created_at', 'materials', 'facility.parent'])
            ->where('status', 'completed')
            ->whereBetween('completed_at', [$from, $to])
            ->get();

        $created = WorkOrder::whereBetween('created_at', [$from, $to])->get();

        $resolutionHours = $completed->map(function ($wo) {
            $start = $wo->report?->created_at ?? $wo->created_at;

            return $start->diffInMinutes($wo->completed_at) / 60;
        });

        $materials = WorkOrderMaterial::whereIn('work_order_id', $completed->pluck('id'))
            ->get()
            ->groupBy(fn ($m) => strtolower(trim($m->name)))
            ->map(fn ($items) => [
                'name' => $items->first()->name,
                'type' => $items->first()->type,
                'unit' => $items->first()->unit,
                'quantity' => round($items->sum('quantity'), 2),
                'cost' => round($items->sum(fn ($m) => $m->quantity * ($m->unit_cost ?? 0)), 2),
            ])
            ->sortByDesc('cost')->values()->take(10);

        // Technician workload: everyone, including those with nothing completed in this period
        $byPersonnel = User::where('role', 'maintenance')->where('is_active', true)
            ->withCount([
                'assignedWorkOrders as active_now' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES),
                'assignedWorkOrders as overdue_now' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES)
                    ->whereDate('due_date', '<', today()),
            ])
            ->get()
            ->map(function ($tech) use ($completed, $created) {
                $done = $completed->where('assigned_to', $tech->id);

                return [
                    'name' => $tech->name,
                    'specialization' => $tech->specialization,
                    'assigned' => $created->where('assigned_to', $tech->id)->count(),
                    'completed' => $done->count(),
                    'active_now' => $tech->active_now,
                    'overdue_now' => $tech->overdue_now,
                    'avg_hours' => $done->count()
                        ? round($done->avg(fn ($wo) => ($wo->started_at ?? $wo->created_at)->diffInMinutes($wo->completed_at) / 60), 1)
                        : null,
                ];
            })
            ->sortByDesc('completed')->values();

        // Equipment: current condition of everything, and the equipment that needed the most work in this period
        $equipment = Equipment::all();
        $equipmentConditions = collect(Equipment::CONDITIONS)->mapWithKeys(fn ($c) => [$c => $equipment->where('condition', $c)->count()]);
        $byEquipment = $reports->whereNotNull('equipment_id')->groupBy('equipment_id')
            ->map(fn ($items) => [
                'code' => $items->first()->equipment?->code,
                'name' => $items->first()->equipment?->name ?? 'Removed equipment',
                'requests' => $items->count(),
            ])
            ->sortByDesc('requests')->values()->take(10);

        $byFacility = $reports->groupBy(fn ($r) => $r->facility?->full_name ?? 'Unspecified')
            ->map(fn ($items, $name) => ['name' => $name, 'total' => $items->count()])
            ->sortByDesc('total')->values()->take(10);

        $count = fn ($collection, $key) => $collection->groupBy(fn ($r) => $r->{$key} ?? 'unset')
            ->map->count()->sortDesc();

        $total = $reports->count();
        $done = $reports->where('status', 'completed')->count();

        return [
            'period' => $data['period'],
            'label' => $label,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'summary' => [
                'total_reports' => $total,
                'pending' => $reports->where('status', 'pending')->count(),
                'approved' => $reports->where('status', 'approved')->count(),
                'in_progress' => $reports->where('status', 'in_progress')->count(),
                'completed' => $done,
                'rejected' => $reports->where('status', 'rejected')->count(),
                'completion_rate' => $total ? round($done / $total * 100, 1) : 0,
                'work_orders_created' => $created->count(),
                'repairs_completed' => $completed->count(),
                'avg_resolution_hours' => $resolutionHours->count() ? round($resolutionHours->avg(), 1) : null,
                'materials_cost' => round($completed->sum('materials_cost'), 2),
                'corrective_completed' => $completed->where('type', 'corrective')->count(),
                'preventive_completed' => $completed->where('type', 'preventive')->count(),
                'equipment_total' => $equipment->count(),
                'maintenance_overdue' => $equipment->where('maintenance_state', 'overdue')->count(),
            ],
            'equipment_conditions' => $equipmentConditions,
            'by_equipment' => $byEquipment,
            'by_category' => $count($reports, 'category'),
            'by_priority' => $count($reports, 'priority'),
            'by_facility' => $byFacility,
            'by_personnel' => $byPersonnel,
            'materials' => $materials,
            'trend' => $this->trend($reports, $completed, $from, $to),
        ];
    }

    /** @return array{0: Carbon, 1: Carbon, 2: string} */
    private function range(array $data): array
    {
        $year = $data['year'] ?? now()->year;

        switch ($data['period']) {
            case 'monthly':
                $from = Carbon::create($year, $data['month'] ?? now()->month, 1)->startOfMonth();

                return [$from, $from->copy()->endOfMonth(), $from->format('F Y')];
            case 'quarterly':
                $q = $data['quarter'] ?? now()->quarter;
                $from = Carbon::create($year, ($q - 1) * 3 + 1, 1)->startOfMonth();

                return [$from, $from->copy()->addMonths(2)->endOfMonth(), "Q$q $year"];
            case 'yearly':
                $from = Carbon::create($year, 1, 1)->startOfYear();

                return [$from, $from->copy()->endOfYear(), (string) $year];
            default:
                $from = Carbon::parse($data['from'])->startOfDay();
                $to = Carbon::parse($data['to'])->endOfDay();

                return [$from, $to, $from->format('M j, Y').' – '.$to->format('M j, Y')];
        }
    }

    /** Daily buckets for ranges up to ~2 months, monthly buckets otherwise. */
    private function trend($reports, $completed, Carbon $from, Carbon $to): array
    {
        $daily = $from->diffInDays($to) <= 62;
        $format = $daily ? 'Y-m-d' : 'Y-m';
        $period = CarbonPeriod::create($from->copy()->startOfDay(), $daily ? '1 day' : '1 month', $to);

        $submitted = $reports->groupBy(fn ($r) => $r->created_at->format($format))->map->count();
        $done = $completed->groupBy(fn ($w) => $w->completed_at->format($format))->map->count();

        $rows = [];
        foreach ($period as $date) {
            $key = $date->format($format);
            $rows[] = [
                'label' => $daily ? $date->format('M j') : $date->format('M Y'),
                'submitted' => $submitted[$key] ?? 0,
                'completed' => $done[$key] ?? 0,
            ];
        }

        return $rows;
    }
}
