<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Support\Str;

/**
 * Creates in-app notifications. The mobile app polls these.
 */
class Notifier
{
    /**
     * @param  iterable<int>|int  $userIds
     * @return string batch id (groups one send to many recipients)
     */
    public static function send(
        iterable|int $userIds,
        string $title,
        string $message,
        string $type = 'info',
        ?Report $report = null,
        ?WorkOrder $workOrder = null,
        ?User $sender = null,
    ): string {
        $batch = (string) Str::uuid();
        $ids = collect(is_int($userIds) ? [$userIds] : $userIds)->filter()->unique();
        $now = now();

        $rows = $ids->map(fn ($id) => [
            'user_id' => $id,
            'title' => $title,
            'message' => $message,
            'type' => $type,
            'report_id' => $report?->id ?? $workOrder?->report_id,
            'work_order_id' => $workOrder?->id,
            'sent_by' => $sender?->id,
            'batch_id' => $batch,
            'created_at' => $now,
            'updated_at' => $now,
        ])->values()->all();

        if ($rows) {
            AppNotification::insert($rows);
        }

        return $batch;
    }

    public static function admins(): array
    {
        return User::where('role', 'admin')->where('is_active', true)->pluck('id')->all();
    }
}
