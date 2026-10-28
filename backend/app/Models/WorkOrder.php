<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkOrder extends Model
{
    public const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

    /** Statuses still counted as "on someone's plate". */
    public const ACTIVE_STATUSES = ['pending', 'in_progress'];

    protected $fillable = [
        'reference', 'report_id', 'facility_id', 'title', 'description', 'category', 'priority',
        'status', 'assigned_to', 'created_by', 'assigned_at', 'due_date', 'started_at',
        'completed_at', 'actions_taken', 'remarks',
    ];

    protected $casts = [
        'assigned_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'due_date' => 'date:Y-m-d',
    ];

    protected $appends = ['materials_cost'];

    protected static function booted(): void
    {
        static::creating(function (WorkOrder $wo) {
            if (! $wo->reference) {
                $wo->reference = self::nextReference();
            }
        });
    }

    public static function nextReference(): string
    {
        $year = now()->format('Y');
        $count = self::where('reference', 'like', "WO-$year-%")->count() + 1;

        do {
            $ref = sprintf('WO-%s-%04d', $year, $count++);
        } while (self::where('reference', $ref)->exists());

        return $ref;
    }

    public function getMaterialsCostAttribute(): float
    {
        if (! $this->relationLoaded('materials')) {
            return 0;
        }

        return round($this->materials->sum(fn ($m) => (float) $m->quantity * (float) ($m->unit_cost ?? 0)), 2);
    }

    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class);
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function photos(): HasMany
    {
        return $this->hasMany(WorkOrderPhoto::class);
    }

    public function materials(): HasMany
    {
        return $this->hasMany(WorkOrderMaterial::class);
    }
}
