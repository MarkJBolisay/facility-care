<?php

namespace Database\Seeders;

use App\Models\AppNotification;
use App\Models\Facility;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Starting data: the admin, the technicians, the campus buildings/rooms and the equipment.
     * No demo reporters or reports. Every account here starts with the password "password".
     */
    public function run(): void
    {
        mt_srand(2026);

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

        // --- Facilities ----------------------------------------------------
        $buildings = [
            ['MB', 'Main Building', [
                ['MB-101', 'Room 101', 'room', '1st'], ['MB-102', 'Room 102', 'room', '1st'],
                ['MB-201', 'Room 201', 'room', '2nd'], ['MB-REG', 'Registrar Office', 'office', '1st'],
                ['MB-CR1', 'Restroom (1st Floor)', 'restroom', '1st'],
            ]],
            ['SB', 'Science Building', [
                ['SB-CHEM1', 'Chemistry Laboratory 1', 'laboratory', '1st'],
                ['SB-PHYS', 'Physics Laboratory', 'laboratory', '2nd'],
                ['SB-BIO', 'Biology Laboratory', 'laboratory', '2nd'],
                ['SB-301', 'Room 301', 'room', '3rd'],
            ]],
            ['ITB', 'IT Building', [
                ['ITB-CL1', 'Computer Laboratory 1', 'laboratory', '1st'],
                ['ITB-CL2', 'Computer Laboratory 2', 'laboratory', '1st'],
                ['ITB-SRV', 'Server Room', 'room', '2nd'],
                ['ITB-CR2', 'Restroom (2nd Floor)', 'restroom', '2nd'],
            ]],
            ['GYM', 'Gymnasium', [
                ['GYM-CRT', 'Basketball Court', 'other', '1st'],
                ['GYM-LCK', 'Locker Room', 'room', '1st'],
            ]],
        ];

        $rooms = collect();
        foreach ($buildings as [$code, $name, $children]) {
            $b = Facility::create(['code' => $code, 'name' => $name, 'type' => 'building', 'status' => 'operational',
                'description' => "$name campus facility"]);
            foreach ($children as [$c, $n, $t, $floor]) {
                $rooms->push(Facility::create([
                    'code' => $c, 'name' => $n, 'type' => $t, 'parent_id' => $b->id, 'floor' => $floor,
                    'capacity' => in_array($t, ['room', 'laboratory']) ? mt_rand(30, 50) : null, 'status' => 'operational',
                ]));
            }
        }
        $rooms->push(Facility::create(['code' => 'OUT-PARK', 'name' => 'Parking Area', 'type' => 'outdoor', 'status' => 'operational']));

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

        // Equipment profiles, preventive schedules and the activity history
        $this->call(EquipmentSeeder::class);
    }
}
