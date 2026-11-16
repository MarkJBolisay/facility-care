<?php

namespace Database\Seeders;

use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Starting data: only the admin and the technicians (password "password").
     * Buildings, rooms and equipment are added by the admin in the app.
     */
    public function run(): void
    {
        // --- Users ---------------------------------------------------------
        $admin = User::create([
            'name' => 'Facility Admin', 'email' => 'adminfacilitycare@gmail.com', 'password' => 'password',
            'role' => 'admin', 'department' => 'Facility Management Office', 'phone' => '0917 000 0001',
        ]);

        collect([
            ['Julie Tapleras', 'julietapleras@gmail.com', 'electrical'],
            ['Oliver Sarmiento', 'oliversarmiento@gmail.com', 'plumbing'],
        ])->each(fn ($t, $i) => User::create([
            'name' => $t[0], 'email' => $t[1], 'password' => 'password', 'role' => 'maintenance',
            'specialization' => $t[2], 'department' => 'Maintenance', 'phone' => '0918 000 00'.($i + 10),
        ]));

        // Welcome notifications
        foreach (User::all() as $u) {
            AppNotification::create([
                'user_id' => $u->id,
                'title' => 'Welcome to FacilityCare',
                'message' => 'Report facility issues, track repairs and get updates in one place.',
                'type' => 'announcement',
                'sent_by' => $admin->id,
                'batch_id' => 'welcome',
            ]);
        }
    }
}
