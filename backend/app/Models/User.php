<?php

namespace App\Models;

use Database\Factories\UserFactory;
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

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'is_available' => 'boolean',
        ];
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
