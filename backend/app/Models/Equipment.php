<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A piece of equipment (computer, aircon, projector, fire extinguisher, ...).
 * Has a condition, a location (facility) and an optional preventive maintenance schedule.
 */
class Equipment extends Model
{
    protected $table = 'equipment';

    public const CATEGORIES = [
        'computer', 'printer', 'network', 'projector', 'aircon', 'electrical',
        'plumbing', 'lab_equipment', 'furniture', 'safety', 'appliance', 'other',
    ];

    public const CONDITIONS = ['operational', 'needs_repair', 'under_maintenance', 'out_of_service'];

    public const IMPORTANCE = ['low', 'medium', 'high'];

    /** Days before the due date when an item counts as "due soon". */
    public const DUE_SOON_DAYS = 14;

    /** Which repair category (and technician specialization) an equipment type usually needs. */
    public const REPAIR_CATEGORY = [
        'computer' => 'it_equipment', 'printer' => 'it_equipment', 'network' => 'it_equipment',
        'projector' => 'it_equipment', 'aircon' => 'aircon', 'electrical' => 'electrical',
        'plumbing' => 'plumbing', 'lab_equipment' => 'it_equipment', 'furniture' => 'furniture',
        'safety' => 'safety', 'appliance' => 'electrical', 'other' => 'others',
    ];

    protected $fillable = [
        'code', 'name', 'category', 'model', 'serial_number', 'department', 'facility_id',
        'acquisition_date', 'condition', 'importance', 'maintenance_interval_days',
        'last_maintained_at', 'last_reminded_at', 'notes',
    ];

    protected $casts = [
        'acquisition_date' => 'date:Y-m-d',
        'last_maintained_at' => 'date:Y-m-d',
        'last_reminded_at' => 'datetime',
        'maintenance_interval_days' => 'integer',
    ];

    protected $appends = ['next_maintenance_due', 'maintenance_state'];

    protected static function booted(): void
    {
        static::creating(function (Equipment $e) {
            if (! $e->code) {
                $e->code = self::nextCode();
            }
        });
    }

    public static function nextCode(): string
    {
        $n = self::count() + 1;
        do {
            $code = sprintf('EQ-%04d', $n++);
        } while (self::where('code', $code)->exists());

        return $code;
    }

    /** Next preventive maintenance date, or null when there is no schedule. */
    public function getNextMaintenanceDueAttribute(): ?string
    {
        if (! $this->maintenance_interval_days) {
            return null;
        }
        $base = $this->last_maintained_at ?? $this->acquisition_date ?? $this->created_at;

        return $base ? Carbon::parse($base)->addDays($this->maintenance_interval_days)->toDateString() : null;
    }

    /** none | scheduled | due_soon | overdue */
    public function getMaintenanceStateAttribute(): string
    {
        $due = $this->next_maintenance_due;
        if (! $due) {
            return 'none';
        }
        $due = Carbon::parse($due)->startOfDay();
        if ($due->lt(today())) {
            return 'overdue';
        }

        return $due->lte(today()->addDays(self::DUE_SOON_DAYS)) ? 'due_soon' : 'scheduled';
    }

    public function repairCategory(): string
    {
        return self::REPAIR_CATEGORY[$this->category] ?? 'others';
    }

    /**
     * A report that marked this equipment "Needs Repair" was withdrawn or rejected.
     * Put it back to Operational, unless another open report or work order still needs it repaired.
     */
    public function releaseRepairFlag(Report $closed, ?User $by, string $why): void
    {
        if ($this->condition !== 'needs_repair') {
            return;
        }

        $stillOpen = $this->reports()->whereKeyNot($closed->id)
            ->whereIn('status', Report::OPEN_STATUSES)->exists()
            || $this->workOrders()->whereIn('status', WorkOrder::ACTIVE_STATUSES)->exists();
        if ($stillOpen) {
            return;
        }

        $this->update(['condition' => 'operational']);
        ActivityLog::record('condition_changed', "{$this->code} is back to Operational because {$closed->reference} was $why.",
            $by, equipment: $this, from: 'needs_repair', to: 'operational');
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function reports(): HasMany
    {
        return $this->hasMany(Report::class);
    }

    /** The newest request about this equipment that is not fixed yet (shown to reporters to avoid duplicates). */
    public function openReport(): HasOne
    {
        return $this->hasOne(Report::class)->ofMany(['id' => 'max'], fn ($q) => $q->whereIn('status', Report::OPEN_STATUSES));
    }

    public function workOrders(): HasMany
    {
        return $this->hasMany(WorkOrder::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }
}
