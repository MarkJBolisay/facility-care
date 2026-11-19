<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkOrderMaterial extends Model
{
    protected $fillable = ['work_order_id', 'name', 'type', 'quantity', 'unit', 'unit_cost', 'purpose', 'photo', 'added_by', 'used_at'];

    protected $casts = [
        'quantity' => 'float',
        'unit_cost' => 'float',
        'used_at' => 'datetime',
    ];

    protected $appends = ['photo_url'];

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo ? asset($this->photo) : null;
    }

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'added_by');
    }
}
