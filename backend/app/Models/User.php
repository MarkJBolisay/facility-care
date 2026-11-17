<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const ROLES = ['admin', 'maintenance', 'student', 'faculty', 'staff'];

    /** Roles that can submit facility reports. */
    public const REPORTER_ROLES = ['student', 'faculty', 'staff'];

    /** Student ID format: "PPY" + year + "-" + 5 digits, e.g. PPY2023-00249. */
    public const STUDENT_ID_PATTERN = '/^PPY\d{4}-\d{5}$/';

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'phone',
        'department',
        'id_number',
        'specialization',
        'is_active',
        'is_available',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected static function booted(): void
    {
        // Turning an account back on does not revive its old logins: the person signs in again.
        static::updated(function (User $user) {
            if ($user->wasChanged('is_active') && $user->is_active) {
                $user->tokens()->delete();
            }
        });
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'is_available' => 'boolean',
        ];
    }

    /** Names are saved with each word starting with a capital: "juan dela cruz" → "Juan Dela Cruz". */
    protected function name(): Attribute
    {
        return Attribute::make(set: fn (?string $value) => $value === null ? null : self::formatName($value));
    }

    /** Capitalize the first letter of every word (also after "-" or "'"), tidy the spaces, leave the other letters as typed. */
    public static function formatName(string $name): string
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name));

        return preg_replace_callback('/(^|[\s\-\'])(\p{Ll})/u', fn ($m) => $m[1].mb_strtoupper($m[2]), $name);
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isMaintenance(): bool
    {
        return $this->role === 'maintenance';
    }

    public function reports(): HasMany
    {
        return $this->hasMany(Report::class);
    }

    public function assignedWorkOrders(): HasMany
    {
        return $this->hasMany(WorkOrder::class, 'assigned_to');
    }

    public function appNotifications(): HasMany
    {
        return $this->hasMany(AppNotification::class);
    }
}
