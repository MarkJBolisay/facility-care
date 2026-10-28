<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkOrderPhoto extends Model
{
    protected $fillable = ['work_order_id', 'type', 'path', 'uploaded_by'];

    protected $appends = ['url'];

    public function getUrlAttribute(): string
    {
        return asset($this->path);
    }

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }
}
