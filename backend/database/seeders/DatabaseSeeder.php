<?php

namespace Database\Seeders;

use App\Models\AppNotification;
use App\Models\Facility;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Demo data. Every account's password is "password".
     */
    public function run(): void
    {
        mt_srand(2026);

        // --- Users ---------------------------------------------------------
        $admin = User::create([
            'name' => 'Facility Admin', 'email' => 'adminfacilitycare@gmail.com', 'password' => 'password',
            'role' => 'admin', 'department' => 'Facility Management Office', 'phone' => '0917 000 0001',
        ]);

        $tech = collect([
            ['Julie Tapleras', 'julietapleras@gmail.com', 'electrical'],
            ['Oliver Sarmiento', 'oliversarmiento@gmail.com', 'plumbing'],
        ])->map(fn ($t, $i) => User::create([
            'name' => $t[0], 'email' => $t[1], 'password' => 'password', 'role' => 'maintenance',
            'specialization' => $t[2], 'department' => 'Maintenance', 'phone' => '0918 000 00'.($i + 10),
        ]));

        $reporters = collect([
            ['Juan Mercado', 'student@facilitycare.test', 'student', 'BSIT', '2023-00123'],
            ['Ana Villanueva', 'ana@facilitycare.test', 'student', 'BSED', '2022-00456'],
            ['Prof. Carlo Garcia', 'faculty@facilitycare.test', 'faculty', 'College of Engineering', 'F-1021'],
            ['Dr. Maria Lopez', 'maria@facilitycare.test', 'faculty', 'College of Science', 'F-1088'],
            ['Grace Tan', 'staff@facilitycare.test', 'staff', 'Registrar', 'S-0301'],
        ])->map(fn ($r) => User::create([
            'name' => $r[0], 'email' => $r[1], 'password' => 'password', 'role' => $r[2],
            'department' => $r[3], 'id_number' => $r[4],
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

        // --- Reports & work orders ----------------------------------------
        $issues = [
            ['electrical', 'Flickering ceiling lights', 'Two fluorescent lights near the board keep flickering during class.', ['LED tube 18W', 'pcs', 180], ['Starter', 'pcs', 35]],
            ['electrical', 'No power on wall outlet', 'The outlet beside the teacher\'s table has no power.', ['Duplex outlet', 'pcs', 120], ['Electrical tape', 'roll', 45]],
            ['plumbing', 'Leaking faucet', 'Faucet keeps dripping even when fully closed. Water is wasted.', ['Faucet washer set', 'set', 60], ['Teflon tape', 'roll', 25]],
            ['plumbing', 'Clogged toilet', 'Toilet in the second cubicle is clogged and overflowing.', ['Drain cleaner', 'bottle', 150]],
            ['aircon', 'Aircon not cooling', 'The air conditioner runs but only blows warm air.', ['Freon R410a', 'kg', 650], ['Aircon cleaning kit', 'set', 300]],
            ['aircon', 'Aircon leaking water', 'Water drips from the aircon unit onto the desks.', ['Drain hose', 'm', 40]],
            ['carpentry', 'Broken door knob', 'Door knob is loose and the door cannot be locked.', ['Door knob lockset', 'pcs', 450], ['Wood screws', 'box', 80]],
            ['furniture', 'Broken armchairs', 'Five armchairs have broken writing boards.', ['Plywood board', 'sheet', 520], ['Wood glue', 'bottle', 95]],
            ['it_equipment', 'Projector not displaying', 'The projector turns on but shows no image from the laptop.', ['HDMI cable 10m', 'pcs', 650]],
            ['it_equipment', 'PCs cannot connect to network', 'Around 10 PCs on the left row have no internet connection.', ['Cat6 cable', 'm', 25], ['RJ45 connectors', 'pcs', 8]],
            ['structural', 'Ceiling water stain and leak', 'Ceiling board is stained and drips when it rains.', ['Ceiling board', 'sheet', 380], ['Roof sealant', 'tube', 260]],
            ['safety', 'Fire extinguisher expired', 'Fire extinguisher near the exit is past its expiry date.', ['Fire extinguisher refill', 'pcs', 900]],
            ['cleaning', 'Pest problem in lab', 'Cockroaches seen near the sink and cabinets.', ['Pest control spray', 'can', 220]],
            ['electrical', 'Exhaust fan not working', 'Exhaust fan in the restroom does not turn on.', ['Exhaust fan 8"', 'pcs', 850]],
        ];
        $equipment = [['Ladder', 'unit'], ['Multimeter', 'unit'], ['Pipe wrench', 'unit'], ['Drill', 'unit']];
        $priorities = ['low', 'medium', 'medium', 'high', 'high', 'critical'];

        $start = now()->subMonths(8)->startOfMonth();
        $totalDays = $start->diffInDays(now());

        for ($i = 0; $i < 70; $i++) {
            $issue = $issues[array_rand($issues)];
            $facility = $rooms->random();
            $reporter = $reporters->random();
            // Skew dates toward recent months so the current month has activity.
            $createdAt = $start->copy()->addDays((int) floor($totalDays * sqrt(mt_rand(0, 1000) / 1000)))
                ->setTime(mt_rand(7, 17), mt_rand(0, 59));
            if ($createdAt->isFuture()) {
                $createdAt = now()->subHours(mt_rand(1, 48));
            }
            $ageDays = $createdAt->diffInDays(now());

            // Older reports are more likely to be finished.
            $roll = mt_rand(1, 100);
            $status = match (true) {
                $ageDays > 20 => $roll <= 85 ? 'completed' : ($roll <= 93 ? 'rejected' : 'in_progress'),
                $ageDays > 5 => $roll <= 45 ? 'completed' : ($roll <= 65 ? 'in_progress' : ($roll <= 80 ? 'approved' : ($roll <= 88 ? 'rejected' : 'pending'))),
                default => $roll <= 15 ? 'in_progress' : ($roll <= 35 ? 'approved' : ($roll <= 40 ? 'rejected' : 'pending')),
            };

            $report = new Report([
                'user_id' => $reporter->id,
                'facility_id' => $facility->id,
                'title' => $issue[1],
                'description' => $issue[2],
                'category' => $status === 'pending' && mt_rand(0, 1) ? null : $issue[0],
                'priority' => $status === 'pending' ? null : $priorities[array_rand($priorities)],
                'status' => $status,
            ]);
            $report->created_at = $createdAt;
            $report->updated_at = $createdAt;

            if ($status !== 'pending') {
                $report->reviewed_by = $admin->id;
                $report->reviewed_at = $createdAt->copy()->addHours(mt_rand(1, 20));
            }
            if ($status === 'rejected') {
                $report->admin_remarks = collect([
                    'Duplicate of an existing report.',
                    'Already fixed during routine inspection.',
                    'Not a facility issue — please contact the IT helpdesk.',
                ])->random();
            }
            $report->save();

            if (in_array($status, ['approved', 'in_progress', 'completed'])) {
                $assignee = $tech->firstWhere('specialization', $issue[0]) ?? $tech->random();
                $assignedAt = $report->reviewed_at->copy()->addHours(mt_rand(0, 6));

                $wo = new WorkOrder([
                    'report_id' => $report->id,
                    'facility_id' => $facility->id,
                    'title' => $report->title,
                    'description' => $report->description,
                    'category' => $issue[0],
                    'priority' => $report->priority,
                    'assigned_to' => ($status === 'approved' && mt_rand(1, 3) === 1) ? null : $assignee->id,
                    'created_by' => $admin->id,
                    'due_date' => $assignedAt->copy()->addDays(mt_rand(1, 7))->toDateString(),
                    'status' => match ($status) { 'approved' => 'pending', default => $status },
                ]);
                $wo->assigned_at = $wo->assigned_to ? $assignedAt : null;
                $wo->created_at = $assignedAt;
                $wo->updated_at = $assignedAt;

                if (in_array($status, ['in_progress', 'completed'])) {
                    $wo->started_at = $assignedAt->copy()->addHours(mt_rand(2, 30));
                }
                if ($status === 'completed') {
                    $wo->completed_at = $wo->started_at->copy()->addHours(mt_rand(1, 72));
                    if ($wo->completed_at->isFuture()) {
                        $wo->completed_at = now()->subMinutes(mt_rand(10, 600));
                    }
                    $wo->actions_taken = 'Inspected the issue, replaced the defective parts and tested. Working properly.';
                    $wo->remarks = collect(['No further issues.', 'Advised users to report if it happens again.', 'Recommend scheduled check next month.'])->random();
                }
                $wo->save();

                if (in_array($status, ['in_progress', 'completed'])) {
                    foreach (array_slice($issue, 3) as [$name, $unit, $cost]) {
                        $wo->materials()->create(['name' => $name, 'type' => 'material', 'quantity' => mt_rand(1, 4), 'unit' => $unit, 'unit_cost' => $cost]);
                    }
                    if (mt_rand(0, 1)) {
                        [$eq, $unit] = $equipment[array_rand($equipment)];
                        $wo->materials()->create(['name' => $eq, 'type' => 'equipment', 'quantity' => 1, 'unit' => $unit]);
                    }
                }
            }
        }

        // Fresh, still-pending reports waiting for admin review
        foreach ([0, 2, 5, 9, 12, 13] as $n => $idx) {
            $issue = $issues[$idx];
            $report = new Report([
                'user_id' => $reporters[$n % $reporters->count()]->id,
                'facility_id' => $rooms->random()->id,
                'title' => $issue[1],
                'description' => $issue[2],
                'category' => $n % 2 ? $issue[0] : null,
                'status' => 'pending',
            ]);
            $report->created_at = $report->updated_at = now()->subHours(mt_rand(1, 60));
            $report->save();
        }

        // A few standalone (preventive) work orders not tied to a report
        foreach ([
            ['Quarterly aircon cleaning – IT Building', 'ITB-CL1', 'aircon', 'medium', 'Oliver Sarmiento'],
            ['Monthly fire extinguisher inspection', 'MB-101', 'safety', 'high', 'Julie Tapleras'],
            ['Generator test run', 'GYM-CRT', 'electrical', 'low', 'Julie Tapleras'],
        ] as [$title, $code, $cat, $prio, $who]) {
            WorkOrder::create([
                'facility_id' => $rooms->firstWhere('code', $code)->id,
                'title' => $title,
                'description' => 'Preventive maintenance scheduled by the facility office.',
                'category' => $cat,
                'priority' => $prio,
                'status' => 'pending',
                'assigned_to' => $tech->firstWhere('name', $who)->id,
                'assigned_at' => now(),
                'created_by' => $admin->id,
                'due_date' => now()->addDays(mt_rand(2, 10))->toDateString(),
            ]);
        }

        // Mark one facility under maintenance, as an example
        $rooms->firstWhere('code', 'SB-CHEM1')->update(['status' => 'under_maintenance']);

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
