<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of history: who did what, when, to which request / work order / equipment.
 */
class ActivityLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'action', 'description', 'from_value', 'to_value',
        'report_id', 'work_order_id', 'equipment_id', 'created_at',
    ];

    protected $casts = ['created_at' => 'datetime'];

    /**
     * Record an activity. Report / equipment are filled in from the work order when not given.
     */
    public static function record(
        string $action,
        string $description,
        ?User $user = null,
        ?Report $report = null,
        ?WorkOrder $workOrder = null,
        ?Equipment $equipment = null,
        ?string $from = null,
        ?string $to = null,
    ): self {
        return self::create([
            'user_id' => $user?->id,
            'action' => $action,
            'description' => $description,
            'from_value' => $from,
            'to_value' => $to,
            'report_id' => $report?->id ?? $workOrder?->report_id,
            'work_order_id' => $workOrder?->id,
            'equipment_id' => $equipment?->id ?? $workOrder?->equipment_id ?? $report?->equipment_id,
            'created_at' => now(),
        ]);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class);
    }

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }

    public function equipment(): BelongsTo
    {
        return $this->belongsTo(Equipment::class);
    }
}
