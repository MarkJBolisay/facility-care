<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkOrder extends Model
{
    public const STATUSES = ['pending', 'in_progress', 'nearing_completion', 'completed', 'cancelled'];

    /** The five stages shown on the progress timeline. */
    public const STAGES = ['reported', 'pending', 'in_progress', 'nearing_completion', 'completed'];

    /** Stage order used to stop skipping or going backwards. */
    public const STAGE_ORDER = ['reported' => 0, 'pending' => 1, 'in_progress' => 2, 'nearing_completion' => 3, 'completed' => 4];

    /** Statuses still counted as "on someone's plate". */
    public const ACTIVE_STATUSES = ['pending', 'in_progress', 'nearing_completion'];

    /** corrective = fixing a reported problem · preventive = scheduled servicing */
    public const TYPES = ['corrective', 'preventive'];

    /** The campus clock: the server runs on UTC, but "today" for a target date is today in the Philippines. */
    public const LOCAL_TIMEZONE = 'Asia/Manila';

    /**
     * A target date can't be set in the past. $current is the date already saved,
     * so editing an overdue work order without touching its date still works.
     */
    public static function assertDueDateNotPast(?string $due, ?string $current = null): void
    {
        if (! $due) {
            return;
        }
        $due = Carbon::parse($due)->toDateString();
        if ($due === $current) {
            return;
        }
        if ($due < Carbon::today(self::LOCAL_TIMEZONE)->toDateString()) {
            throw ValidationException::withMessages(['due_date' => "Target date can't be in the past."]);
        }
    }

    protected $fillable = [
        'reference', 'report_id', 'facility_id', 'equipment_id', 'title', 'description', 'category', 'type', 'priority',
        'status', 'assigned_to', 'created_by', 'assigned_at', 'due_date', 'started_at',
        'nearing_completion_at', 'completed_at', 'completed_by', 'actions_taken', 'remarks',
        'no_materials_reason', 'condition_after', 'overdue_notified_at',
    ];

    protected $casts = [
        'assigned_at' => 'datetime',
        'started_at' => 'datetime',
        'nearing_completion_at' => 'datetime',
        'completed_at' => 'datetime',
        'overdue_notified_at' => 'datetime',
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

    public function equipment(): BelongsTo
    {
        return $this->belongsTo(Equipment::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(ActivityLog::class)->latest('created_at')->latest('id');
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

    public function stages(): HasMany
    {
        return $this->hasMany(WorkOrderStage::class)->orderBy('created_at');
    }

    public function materials(): HasMany
    {
        return $this->hasMany(WorkOrderMaterial::class);
    }

    public function completer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by');
    }
}
