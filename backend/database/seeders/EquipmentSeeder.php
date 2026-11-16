<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\Equipment;
use App\Models\Facility;
use App\Models\Report;
use App\Models\User;
use App\Models\WorkOrder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Sample equipment for the demo campus, linked to the existing requests and work orders.
 * Safe to run on a database that already has data: it only adds what is missing.
 *
 *   php artisan db:seed --class=EquipmentSeeder
 */
class EquipmentSeeder extends Seeder
{
    public function run(): void
    {

        if (Equipment::count() === 0) {
            $this->equipment();
        }

        $this->linkExistingRecords();

        if (ActivityLog::count() === 0) {
            $this->backfillActivity();
        }
    }

    private function equipment(): void
    {
        $f = Facility::pluck('id', 'code');
        $today = today();

        // [facility code, name, category, model, department, importance, interval days, days since last service, acquired]
        $items = [
            ['ITB-CL1', 'Desktop PC – Station 1', 'computer', 'Acer Veriton X2690G', 'ICT Department', 'medium', 180, 120, '2022-06-15'],
            ['ITB-CL1', 'Desktop PC – Station 2', 'computer', 'Acer Veriton X2690G', 'ICT Department', 'medium', 180, 120, '2022-06-15'],
            ['ITB-CL1', 'Desktop PC – Station 3', 'computer', 'Acer Veriton X2690G', 'ICT Department', 'medium', 180, 200, '2022-06-15'],
            ['ITB-CL1', 'Classroom Projector', 'projector', 'Epson EB-X51', 'ICT Department', 'high', 180, 170, '2021-08-02'],
            ['ITB-CL1', 'Split-type Aircon 2.5HP', 'aircon', 'Carrier Optima 2.5HP', 'ICT Department', 'high', 90, 95, '2020-03-10'],
            ['ITB-CL2', 'Desktop PC – Station 1', 'computer', 'Lenovo ThinkCentre M70s', 'ICT Department', 'medium', 180, 60, '2023-07-20'],
            ['ITB-CL2', 'Laser Printer', 'printer', 'Brother HL-L2370DN', 'ICT Department', 'low', 120, 40, '2023-07-20'],
            ['ITB-CL2', 'Split-type Aircon 2HP', 'aircon', 'Koppel Inverter 2HP', 'ICT Department', 'high', 90, 80, '2023-01-12'],
            ['ITB-SRV', 'Network Core Switch', 'network', 'Cisco CBS350-24P', 'ICT Department', 'high', 180, 150, '2021-11-05'],
            ['ITB-SRV', 'Server Room UPS', 'electrical', 'APC Smart-UPS 3000VA', 'ICT Department', 'high', 90, 100, '2021-11-05'],
            ['ITB-SRV', 'Server Room Exhaust Fan', 'appliance', 'Panasonic FV-25AU1', 'ICT Department', 'medium', null, null, '2021-11-05'],
            ['MB-101', 'Classroom Projector', 'projector', 'Epson EB-E01', 'General Education', 'high', 180, 60, '2022-01-18'],
            ['MB-101', 'Split-type Aircon 2HP', 'aircon', 'Carrier Optima 2HP', 'General Education', 'high', 90, 30, '2020-02-14'],
            ['MB-102', 'Ceiling Fans (set of 4)', 'appliance', 'Hanabishi HCF-56', 'General Education', 'low', 180, 175, '2019-06-01'],
            ['MB-201', 'Floor Electrical Panel', 'electrical', 'Schneider 12-circuit', 'Facilities Office', 'high', 180, 90, '2019-06-01'],
            ['MB-REG', 'Office Desktop PC', 'computer', 'HP ProDesk 400 G7', 'Registrar', 'high', 180, 100, '2022-09-01'],
            ['MB-REG', 'Document Printer', 'printer', 'Epson L6290', 'Registrar', 'high', 120, 125, '2022-09-01'],
            ['MB-REG', 'Window-type Aircon 1.5HP', 'aircon', 'Kolin KAG-150', 'Registrar', 'medium', 90, 20, '2019-06-01'],
            ['MB-CR1', 'Lavatory Faucet Set', 'plumbing', 'American Standard', 'Facilities Office', 'medium', 180, 60, '2019-06-01'],
            ['MB-CR1', 'Water Dispenser', 'appliance', 'Fujidenzo FWD-1250', 'Facilities Office', 'medium', 90, 85, '2023-03-01'],
            ['SB-CHEM1', 'Fume Hood', 'lab_equipment', 'Esco Ascent Max', 'Science Department', 'high', 180, 140, '2020-07-15'],
            ['SB-CHEM1', 'Emergency Eyewash Station', 'safety', 'Haws 7612', 'Science Department', 'high', 30, 35, '2020-07-15'],
            ['SB-PHYS', 'Digital Oscilloscope', 'lab_equipment', 'Rigol DS1054Z', 'Science Department', 'medium', 365, 200, '2021-02-01'],
            ['SB-PHYS', 'Split-type Aircon 2HP', 'aircon', 'Carrier Optima 2HP', 'Science Department', 'high', 90, 50, '2021-02-01'],
            ['SB-BIO', 'Compound Microscope Set', 'lab_equipment', 'Olympus CX23', 'Science Department', 'medium', 365, 100, '2021-02-01'],
            ['SB-BIO', 'Specimen Refrigerator', 'appliance', 'Condura CBC-227', 'Science Department', 'high', 90, 70, '2021-02-01'],
            ['SB-301', 'Classroom Projector', 'projector', 'BenQ MX560', 'Science Department', 'high', 180, 30, '2023-06-10'],
            ['GYM-CRT', 'LED Floodlights', 'electrical', 'Firefly 200W', 'PE Department', 'medium', 180, 130, '2022-04-01'],
            ['GYM-CRT', 'Electronic Scoreboard', 'electrical', 'Nevco 1500', 'PE Department', 'low', 365, 300, '2022-04-01'],
            ['GYM-CRT', 'Sound System', 'other', 'Yamaha Stagepas 600BT', 'PE Department', 'medium', 180, 60, '2022-04-01'],
            ['GYM-LCK', 'Shower Heads (set of 6)', 'plumbing', 'Delta 52650', 'PE Department', 'low', 180, 90, '2019-06-01'],
            ['OUT-PARK', 'Standby Generator Set', 'electrical', 'Denyo DCA-25ESK 25kVA', 'Facilities Office', 'high', 30, 40, '2020-01-20'],
            ['OUT-PARK', 'Solar Street Lights', 'electrical', 'Omni SSL-60W', 'Facilities Office', 'low', 180, 60, '2022-11-01'],
            ['MB', 'Fire Extinguishers – Main Building', 'safety', 'ABC Dry Chemical 10lbs', 'Facilities Office', 'high', 180, 165, '2023-01-05'],
            ['SB', 'Fire Extinguishers – Science Building', 'safety', 'ABC Dry Chemical 10lbs', 'Facilities Office', 'high', 180, 100, '2023-01-05'],
            ['ITB', 'Fire Extinguishers – IT Building', 'safety', 'CO2 Type 10lbs', 'Facilities Office', 'high', 180, 190, '2023-01-05'],
            ['GYM', 'Fire Extinguishers – Gymnasium', 'safety', 'ABC Dry Chemical 10lbs', 'Facilities Office', 'high', 180, 60, '2023-01-05'],
        ];

        foreach ($items as $i => [$code, $name, $cat, $model, $dept, $imp, $interval, $since, $acquired]) {
            Equipment::create([
                'code' => sprintf('EQ-%04d', $i + 1),
                'name' => $name,
                'category' => $cat,
                'model' => $model,
                'serial_number' => strtoupper(substr(md5($code.$name), 0, 4)).'-'.(100000 + $i * 7919 % 900000),
                'department' => $dept,
                'facility_id' => $f[$code] ?? null,
                'acquisition_date' => $acquired,
                'condition' => 'operational',
                'importance' => $imp,
                'maintenance_interval_days' => $interval,
                'last_maintained_at' => $since !== null ? $today->copy()->subDays($since)->toDateString() : null,
            ]);
        }

        // One item has been retired from use
        Equipment::where('name', 'Electronic Scoreboard')->update(['condition' => 'out_of_service', 'notes' => 'Control board burned out. Waiting for budget approval for a replacement.']);
    }

    /** Link existing requests/work orders to equipment in the same room with a matching repair category. */
    private function linkExistingRecords(): void
    {
        $equipment = Equipment::all();
        $severityFor = ['critical' => 'severe', 'high' => 'severe', 'medium' => 'moderate', 'low' => 'minor'];

        foreach (Report::whereNull('equipment_id')->get() as $report) {
            $match = $equipment->first(fn ($e) => $e->facility_id === $report->facility_id
                && $e->repairCategory() === $report->category);

            $updates = [];
            if ($match) {
                $updates['equipment_id'] = $match->id;
            }
            if (! $report->severity) {
                $updates['severity'] = $severityFor[$report->priority] ?? 'moderate';
            }
            if ($updates) {
                $report->forceFill($updates)->saveQuietly();
            }
            if ($match) {
                WorkOrder::where('report_id', $report->id)->whereNull('equipment_id')->update(['equipment_id' => $match->id]);
            }
        }

        // Preventive work orders without a report: match by room and category
        foreach (WorkOrder::whereNull('report_id')->whereNull('equipment_id')->get() as $wo) {
            $match = $equipment->first(fn ($e) => $e->facility_id === $wo->facility_id && $e->repairCategory() === $wo->category);
            $wo->forceFill(['type' => 'preventive', 'equipment_id' => $match?->id])->saveQuietly();
        }

        // Condition and last service date follow the work history
        foreach ($equipment as $e) {
            $active = WorkOrder::where('equipment_id', $e->id)->whereIn('status', WorkOrder::ACTIVE_STATUSES)->get();
            $openReport = Report::where('equipment_id', $e->id)->whereIn('status', ['pending', 'approved'])->exists();
            $lastDone = WorkOrder::where('equipment_id', $e->id)->where('status', 'completed')->max('completed_at');

            $condition = $e->condition;
            if ($condition !== 'out_of_service') {
                if ($active->where('status', 'in_progress')->count()) {
                    $condition = 'under_maintenance';
                } elseif ($openReport || $active->where('type', 'corrective')->count()) {
                    $condition = 'needs_repair';
                }
            }

            $last = $e->last_maintained_at;
            if ($lastDone && (! $last || $last->lt(\Carbon\Carbon::parse($lastDone)))) {
                $last = \Carbon\Carbon::parse($lastDone);
            }

            $e->forceFill(['condition' => $condition, 'last_maintained_at' => $last?->toDateString()])->saveQuietly();
        }
    }

    /** Build the activity history from the timestamps already stored on requests and work orders. */
    private function backfillActivity(): void
    {
        $rows = [];
        $add = function ($at, $action, $text, $user, $report = null, $wo = null, $equipment = null, $to = null) use (&$rows) {
            if (! $at) {
                return;
            }
            $rows[] = [
                'created_at' => $at, 'action' => $action, 'description' => $text, 'user_id' => $user,
                'report_id' => $report, 'work_order_id' => $wo, 'equipment_id' => $equipment,
                'from_value' => null, 'to_value' => $to,
            ];
        };

        foreach (Report::with('reporter:id,name')->get() as $r) {
            $add($r->created_at, 'submitted', 'Request submitted by '.($r->reporter?->name ?? 'a user').'.', $r->user_id, $r->id, null, $r->equipment_id);
            if ($r->reviewed_at) {
                $r->status === 'rejected'
                    ? $add($r->reviewed_at, 'rejected', 'Request rejected: '.($r->admin_remarks ?? ''), $r->reviewed_by, $r->id, null, $r->equipment_id, 'rejected')
                    : $add($r->reviewed_at, 'approved', 'Request approved'.($r->priority ? ' as '.ucfirst($r->priority).' priority' : '').'.', $r->reviewed_by, $r->id, null, $r->equipment_id, 'approved');
            }
        }

        foreach (WorkOrder::with('assignee:id,name')->get() as $w) {
            $add($w->created_at, 'work_order_created', "Work order {$w->reference} created.", $w->created_by, $w->report_id, $w->id, $w->equipment_id);
            if ($w->assigned_at && $w->assignee) {
                $add($w->assigned_at, 'assigned', "Assigned to {$w->assignee->name}.", $w->created_by, $w->report_id, $w->id, $w->equipment_id, $w->assignee->name);
            }
            $add($w->started_at, 'status_changed', 'Repair started.', $w->assigned_to, $w->report_id, $w->id, $w->equipment_id, 'in_progress');
            $add($w->completed_at, 'completed', 'Repair completed.', $w->assigned_to, $w->report_id, $w->id, $w->equipment_id, 'completed');
        }

        usort($rows, fn ($a, $b) => $a['created_at'] <=> $b['created_at']);
        foreach (array_chunk($rows, 200) as $chunk) {
            ActivityLog::insert($chunk);
        }
    }
}
