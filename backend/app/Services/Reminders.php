<?php

namespace App\Services;

use App\Models\Equipment;
use App\Models\WorkOrder;
use Illuminate\Support\Facades\Cache;

/**
 * Automatic reminders:
 *  - overdue work orders → the technician (once a day) and a daily summary to admins
 *  - equipment whose preventive maintenance is overdue or due soon → admins (every 3 days per item)
 *
 * Runs from the scheduler (php artisan schedule:work) and, so it also works without a scheduler,
 * at most once an hour when someone opens the dashboard.
 */
class Reminders
{
    public static function runIfDue(): void
    {
        if (Cache::add('facilitycare:reminders-ran', true, now()->addHour())) {
            self::run();
        }
    }

    /** @return array{overdue_work_orders:int, equipment_due:int} */
    public static function run(): array
    {
        return [
            'overdue_work_orders' => self::overdueWorkOrders(),
            'equipment_due' => self::preventiveMaintenance(),
        ];
    }

    private static function overdueWorkOrders(): int
    {
        $overdue = WorkOrder::with('assignee:id,name')
            ->whereIn('status', WorkOrder::ACTIVE_STATUSES)
            ->whereDate('due_date', '<', today())
            ->where(fn ($q) => $q->whereNull('overdue_notified_at')->orWhere('overdue_notified_at', '<', now()->subDay()))
            ->get();

        foreach ($overdue as $wo) {
            if ($wo->assigned_to) {
                Notifier::send(
                    $wo->assigned_to,
                    'Task overdue',
                    "{$wo->reference} \"{$wo->title}\" was due {$wo->due_date->format('M j')}. Please update its status.",
                    'reminder',
                    null,
                    $wo,
                );
            }
            $wo->forceFill(['overdue_notified_at' => now()])->saveQuietly();
        }

        if ($overdue->count()) {
            $n = $overdue->count();
            Notifier::send(
                Notifier::admins(),
                'Overdue work orders',
                $n === 1
                    ? "{$overdue[0]->reference} \"{$overdue[0]->title}\" is past its target date."
                    : "$n work orders are past their target date.",
                'reminder',
            );
        }

        return $overdue->count();
    }

    private static function preventiveMaintenance(): int
    {
        // Equipment that already has an open preventive work order is taken care of.
        $items = Equipment::whereNotNull('maintenance_interval_days')
            ->where('condition', '!=', 'out_of_service')
            ->whereDoesntHave('workOrders', fn ($q) => $q->where('type', 'preventive')->whereIn('status', WorkOrder::ACTIVE_STATUSES))
            ->where(fn ($q) => $q->whereNull('last_reminded_at')->orWhere('last_reminded_at', '<', now()->subDays(3)))
            ->get()
            ->filter(fn ($e) => in_array($e->maintenance_state, ['overdue', 'due_soon']));

        if ($items->isEmpty()) {
            return 0;
        }

        $overdue = $items->where('maintenance_state', 'overdue')->count();
        $soon = $items->count() - $overdue;
        $names = $items->sortBy('next_maintenance_due')->take(3)
            ->map(fn ($e) => "{$e->name} ({$e->code}, due ".date('M j', strtotime($e->next_maintenance_due)).')')
            ->implode('; ');

        Notifier::send(
            Notifier::admins(),
            'Preventive maintenance reminder',
            trim(($overdue ? "$overdue overdue" : '').($overdue && $soon ? ', ' : '').($soon ? "$soon due soon" : '')).
                ": $names".($items->count() > 3 ? ' and more.' : '.'),
            'reminder',
        );

        Equipment::whereIn('id', $items->pluck('id'))->update(['last_reminded_at' => now()]);

        return $items->count();
    }
}
