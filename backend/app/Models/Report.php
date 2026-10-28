<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Report extends Model
{
    public const CATEGORIES = [
        'electrical', 'plumbing', 'carpentry', 'aircon', 'it_equipment',
        'structural', 'cleaning', 'furniture', 'safety', 'others',
    ];

    public const PRIORITIES = ['low', 'medium', 'high', 'critical'];

    public const STATUSES = ['pending', 'approved', 'rejected', 'in_progress', 'completed'];

    protected $fillable = [
        'reference', 'user_id', 'facility_id', 'location_details', 'title', 'description',
        'category', 'priority', 'status', 'photo', 'admin_remarks', 'reviewed_by', 'reviewed_at',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
    ];

    protected $appends = ['photo_url'];

    protected static function booted(): void
    {
        static::creating(function (Report $report) {
            if (! $report->reference) {
                $report->reference = self::nextReference();
            }
        });
    }

    public static function nextReference(): string
    {
        $year = now()->format('Y');
        $count = self::where('reference', 'like', "RPT-$year-%")->count() + 1;

        do {
            $ref = sprintf('RPT-%s-%04d', $year, $count++);
        } while (self::where('reference', $ref)->exists());

        return $ref;
    }

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo ? asset($this->photo) : null;
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function workOrders(): HasMany
    {
        return $this->hasMany(WorkOrder::class);
    }

    /** The current (non-cancelled) work order, if any. */
    public function activeWorkOrder(): HasOne
    {
        return $this->hasOne(WorkOrder::class)->where('status', '!=', 'cancelled')->latestOfMany();
    }
}
