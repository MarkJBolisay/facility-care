<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Facility extends Model
{
    public const TYPES = ['building', 'room', 'laboratory', 'office', 'restroom', 'outdoor', 'other'];

    public const STATUSES = ['operational', 'under_maintenance', 'closed'];

    protected $fillable = [
        'code', 'name', 'type', 'parent_id', 'floor', 'capacity', 'description', 'status',
    ];

    protected $appends = ['full_name'];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Facility::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Facility::class, 'parent_id');
    }

    public function reports(): HasMany
    {
        return $this->hasMany(Report::class);
    }

    public function workOrders(): HasMany
    {
        return $this->hasMany(WorkOrder::class);
    }

    /** e.g. "Science Building › Chemistry Lab 2" */
    public function getFullNameAttribute(): string
    {
        $parent = $this->relationLoaded('parent') ? $this->parent : null;

        if (! $parent && $this->parent_id && ! $this->relationLoaded('parent')) {
            $parent = $this->parent()->first();
        }

        return $parent ? $parent->name.' › '.$this->name : $this->name;
    }
}
