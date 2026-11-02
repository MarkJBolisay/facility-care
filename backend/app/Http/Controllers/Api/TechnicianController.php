<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Technician account management: profiles, specializations, availability and their tasks.
 */
class TechnicianController extends Controller
{
    public function index(Request $request)
    {
        $query = User::where('role', 'maintenance')
            ->withCount([
                'assignedWorkOrders as active_count' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES),
                'assignedWorkOrders as in_progress_count' => fn ($q) => $q->where('status', 'in_progress'),
                'assignedWorkOrders as overdue_count' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES)
                    ->whereDate('due_date', '<', today()),
                'assignedWorkOrders as completed_count' => fn ($q) => $q->where('status', 'completed'),
                'assignedWorkOrders as completed_month_count' => fn ($q) => $q->where('status', 'completed')
                    ->where('completed_at', '>=', now()->startOfMonth()),
            ]);

        if ($request->filled('specialization')) {
            $query->where('specialization', $request->input('specialization'));
        }
        if ($request->filled('available')) {
            $query->where('is_available', $request->boolean('available'));
        }
        if ($request->filled('search')) {
            $s = '%'.$request->input('search').'%';
            $query->where(fn ($q) => $q->where('name', 'like', $s)->orWhere('email', 'like', $s));
        }

        return $query->orderByDesc('is_active')->orderBy('name')->get();
    }

    /** Profile + active tasks + recent completed work. */
    public function show(User $technician)
    {
        abort_unless($technician->role === 'maintenance', 404);

        $with = ['facility.parent', 'equipment:id,code,name', 'report:id,reference'];

        return [
            'technician' => $technician->loadCount([
                'assignedWorkOrders as active_count' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES),
                'assignedWorkOrders as completed_count' => fn ($q) => $q->where('status', 'completed'),
                'assignedWorkOrders as overdue_count' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES)
                    ->whereDate('due_date', '<', today()),
            ]),
            'active' => $technician->assignedWorkOrders()->with($with)
                ->whereIn('status', WorkOrder::ACTIVE_STATUSES)
                ->orderByRaw("CASE status WHEN 'in_progress' THEN 0 ELSE 1 END")
                ->orderByRaw('due_date IS NULL, due_date')->get(),
            'completed' => $technician->assignedWorkOrders()->with($with)
                ->where('status', 'completed')->latest('completed_at')->limit(20)->get(),
            'avg_hours' => round((float) $technician->assignedWorkOrders()->where('status', 'completed')
                ->whereNotNull('started_at')->get()
                ->avg(fn ($w) => $w->started_at->diffInMinutes($w->completed_at) / 60), 1),
        ];
    }

    /** Update specialization, availability, active flag and contact details. */
    public function update(Request $request, User $technician)
    {
        abort_unless($technician->role === 'maintenance', 404);

        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'phone' => 'nullable|string|max:30',
            'specialization' => ['nullable', Rule::in(Report::CATEGORIES)],
            'is_available' => 'sometimes|boolean',
            'is_active' => 'sometimes|boolean',
        ]);

        $before = $technician->only(['specialization', 'is_available', 'is_active']);
        $technician->update($data);

        if (array_key_exists('is_available', $data) && $data['is_available'] != $before['is_available']) {
            ActivityLog::record('availability_changed',
                "{$technician->name} marked as ".($technician->is_available ? 'available' : 'not available').'.', $request->user());
        }

        return $technician->fresh();
    }
}
