<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request)
    {
        $user = $request->user();

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

        return [
            'role' => 'admin',
            'reports' => [
                'total' => $byStatus->sum(),
                'pending' => (int) ($byStatus['pending'] ?? 0),
                'approved' => (int) ($byStatus['approved'] ?? 0),
                'in_progress' => (int) ($byStatus['in_progress'] ?? 0),
                'completed' => (int) ($byStatus['completed'] ?? 0),
                'rejected' => (int) ($byStatus['rejected'] ?? 0),
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
            'next_tasks' => (clone $mine)->with(['facility.parent', 'report:id,reference,photo'])
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
            'recent_reports' => Report::with('facility.parent')->where('user_id', $user->id)->latest()->limit(5)->get(),
        ];
    }
}
