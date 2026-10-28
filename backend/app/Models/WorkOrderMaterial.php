<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkOrderMaterial extends Model
{
    protected $fillable = ['work_order_id', 'name', 'type', 'quantity', 'unit', 'unit_cost'];

    protected $casts = [
        'quantity' => 'float',
        'unit_cost' => 'float',
    ];

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }
}
