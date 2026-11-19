<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A completed stage of the repair workflow (one row per stage).
 */
class WorkOrderStage extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['work_order_id', 'stage', 'remarks', 'user_id', 'created_at'];

    protected $casts = ['created_at' => 'datetime'];

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
