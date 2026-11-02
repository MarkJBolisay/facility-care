<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Equipment;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use App\Services\Priority;
use App\Services\Reminders;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request)
    {
        $user = $request->user();

        // Overdue / preventive maintenance reminders (at most once an hour; also runs on the scheduler)
        Reminders::runIfDue();

        return match ($user->role) {
            'admin' => $this->admin(),
            'maintenance' => $this->maintenance($user),
            default => $this->reporter($user),
        };
    }

    private function admin(): array
    {
        $byStatus = Report::selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        $woByStatus = WorkOrder::selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        $openByPriority = Report::whereIn('status', ['pending', 'approved', 'in_progress'])
            ->selectRaw("coalesce(priority, 'unset') as p, count(*) as total")
            ->groupBy('p')->pluck('total', 'p');

        $openByCategory = Report::whereIn('status', ['pending', 'approved', 'in_progress'])
            ->selectRaw("coalesce(category, 'uncategorized') as c, count(*) as total")
            ->groupBy('c')->orderByDesc('total')->pluck('total', 'c');

        // Last 6 months: submitted vs completed reports
        $trend = collect(range(5, 0))->map(function ($i) {
            $start = now()->startOfMonth()->subMonths($i);
            $end = $start->copy()->endOfMonth();

            return [
                'label' => $start->format('M'),
                'submitted' => Report::whereBetween('created_at', [$start, $end])->count(),
                'completed' => WorkOrder::where('status', 'completed')->whereBetween('completed_at', [$start, $end])->count(),
            ];
        });

        $personnel = User::where('role', 'maintenance')->where('is_active', true)
            ->withCount(['assignedWorkOrders as active_count' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES)])
            ->orderByDesc('active_count')->get(['id', 'name', 'is_available', 'specialization']);

        // Approved reports that still have no work order (nobody has been assigned yet)
        $awaitingAssignment = Report::where('status', 'approved')
            ->whereDoesntHave('workOrders', fn ($q) => $q->where('status', '!=', 'cancelled'));

        return [
            'role' => 'admin',
            'reports' => [
                'total' => $byStatus->sum(),
                'today' => Report::whereDate('created_at', today())->count(),
                'pending' => (int) ($byStatus['pending'] ?? 0),
                'approved' => (int) ($byStatus['approved'] ?? 0),
                'in_progress' => (int) ($byStatus['in_progress'] ?? 0),
                'completed' => (int) ($byStatus['completed'] ?? 0),
                'rejected' => (int) ($byStatus['rejected'] ?? 0),
                'awaiting_assignment' => (clone $awaitingAssignment)->count(),
            ],
            'work_orders' => [
                'pending' => (int) ($woByStatus['pending'] ?? 0),
                'in_progress' => (int) ($woByStatus['in_progress'] ?? 0),
                'completed' => (int) ($woByStatus['completed'] ?? 0),
                'unassigned' => WorkOrder::whereIn('status', WorkOrder::ACTIVE_STATUSES)->whereNull('assigned_to')->count(),
                'overdue' => WorkOrder::whereIn('status', WorkOrder::ACTIVE_STATUSES)->whereDate('due_date', '<', today())->count(),
            ],
            'open_by_priority' => $openByPriority,
            'open_by_category' => $openByCategory,
            'trend' => $trend,
            'personnel' => $personnel,
            'recent_reports' => Report::with(['reporter:id,name', 'facility.parent'])->latest()->limit(5)->get(),
            // Step 1 of the admin flow: new reports to review, highest priority score first
            'review_queue' => Report::with(['reporter:id,name,role', 'facility.parent', 'equipment:id,code,name,importance'])
                ->where('status', 'pending')->get()
                ->each(fn ($r) => $r->priority_score = Priority::score($r))
                ->sortByDesc('priority_score')->take(5)->values(),
            // Equipment status summary and preventive maintenance that needs scheduling
            'equipment' => $this->equipmentSummary(),
            // Step 2: approved reports waiting for a maintenance person, most urgent first
            'assign_queue' => (clone $awaitingAssignment)->with(['facility.parent'])
                ->orderByRaw("CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END")
                ->oldest('reviewed_at')->limit(5)->get(),
        ];
    }

    private function equipmentSummary(): array
    {
        $all = Equipment::with('facility.parent')->get();
        $due = $all->filter(fn ($e) => in_array($e->maintenance_state, ['overdue', 'due_soon']))
            ->sortBy('next_maintenance_due')->values();

        return [
            'total' => $all->count(),
            'by_condition' => collect(Equipment::CONDITIONS)->mapWithKeys(fn ($c) => [$c => $all->where('condition', $c)->count()]),
            'maintenance_overdue' => $all->where('maintenance_state', 'overdue')->count(),
            'maintenance_due_soon' => $all->where('maintenance_state', 'due_soon')->count(),
            'maintenance_due' => $due->take(4)->values(),
        ];
    }

    private function maintenance(User $user): array
    {
        $mine = WorkOrder::where('assigned_to', $user->id);

        return [
            'role' => 'maintenance',
            'tasks' => [
                'pending' => (clone $mine)->where('status', 'pending')->count(),
                'in_progress' => (clone $mine)->where('status', 'in_progress')->count(),
                'completed_this_month' => (clone $mine)->where('status', 'completed')
                    ->where('completed_at', '>=', now()->startOfMonth())->count(),
                'completed_total' => (clone $mine)->where('status', 'completed')->count(),
                'overdue' => (clone $mine)->whereIn('status', WorkOrder::ACTIVE_STATUSES)
                    ->whereDate('due_date', '<', today())->count(),
            ],
            'is_available' => $user->is_available,
            'next_tasks' => (clone $mine)->with(['facility.parent', 'report:id,reference,photo', 'equipment:id,code,name'])
                // photo counts let the dashboard show which repair step comes next
                ->withCount(['photos as before_photos_count' => fn ($q) => $q->where('type', 'before'),
                    'photos as after_photos_count' => fn ($q) => $q->where('type', 'after')])
                ->whereIn('status', WorkOrder::ACTIVE_STATUSES)
                ->orderByRaw("CASE status WHEN 'in_progress' THEN 0 ELSE 1 END")
                ->orderByRaw("CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END")
                ->orderByRaw('due_date IS NULL, due_date')
                ->limit(5)->get(),
        ];
    }

    private function reporter(User $user): array
    {
        $byStatus = Report::where('user_id', $user->id)
            ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        return [
            'role' => 'reporter',
            'reports' => [
                'total' => $byStatus->sum(),
                'pending' => (int) ($byStatus['pending'] ?? 0),
                'approved' => (int) ($byStatus['approved'] ?? 0),
                'in_progress' => (int) ($byStatus['in_progress'] ?? 0),
                'completed' => (int) ($byStatus['completed'] ?? 0),
                'rejected' => (int) ($byStatus['rejected'] ?? 0),
            ],
            // Open reports, shown with a progress tracker on the home screen
            'active_reports' => Report::with(['facility.parent', 'equipment:id,code,name', 'activeWorkOrder.assignee:id,name'])
                ->where('user_id', $user->id)
                ->whereIn('status', ['pending', 'approved', 'in_progress'])
                ->latest()->limit(10)->get(),
            // Recently finished (completed or rejected)
            'recent_closed' => Report::with('facility.parent')
                ->where('user_id', $user->id)
                ->whereIn('status', ['completed', 'rejected'])
                ->latest('updated_at')->limit(3)->get(),
        ];
    }
}
