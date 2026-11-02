<?php

namespace App\Services;

use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Support\Collection;

/**
 * Smart technician assignment: ranks technicians for a job.
 *
 * Score (0–100) = specialization match (45) + available (25)
 *               + light workload (30 with no active tasks, −10 per active task)
 *               − 5 for each overdue task
 */
class TechnicianMatcher
{
    /** @return Collection<int, User> technicians with match_score, match_reasons and is_recommended */
    public static function rank(?string $category = null): Collection
    {
        $techs = User::where('role', 'maintenance')
            ->where('is_active', true)
            ->withCount([
                'assignedWorkOrders as active_count' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES),
                'assignedWorkOrders as completed_count' => fn ($q) => $q->where('status', 'completed'),
                'assignedWorkOrders as overdue_count' => fn ($q) => $q->whereIn('status', WorkOrder::ACTIVE_STATUSES)
                    ->whereDate('due_date', '<', today()),
            ])
            ->get();

        foreach ($techs as $t) {
            $reasons = [];
            $score = 0;

            if ($category && $t->specialization === $category) {
                $score += 45;
                $reasons[] = 'Specialization matches';
            }
            if ($t->is_available) {
                $score += 25;
                $reasons[] = 'Available';
            } else {
                $reasons[] = 'Not available';
            }

            $score += max(0, 30 - 10 * $t->active_count);
            $reasons[] = match ((int) $t->active_count) {
                0 => 'No active tasks',
                1 => '1 active task',
                default => "{$t->active_count} active tasks",
            };

            if ($t->overdue_count) {
                $score -= 5 * $t->overdue_count;
                $reasons[] = "{$t->overdue_count} overdue";
            }

            $t->match_score = max(0, min(100, $score));
            $t->match_reasons = $reasons;
        }

        $sorted = $techs->sortBy([['match_score', 'desc'], ['active_count', 'asc'], ['name', 'asc']])->values();
        foreach ($sorted as $i => $t) {
            $t->is_recommended = $i === 0 && $t->is_available;
        }

        return $sorted;
    }
}
