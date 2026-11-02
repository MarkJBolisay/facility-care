<?php

use App\Services\Reminders;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Overdue work orders and preventive maintenance reminders.
// Runs daily with `php artisan schedule:work` (or a cron job running `schedule:run`).
// The dashboard also triggers it at most once an hour, so reminders still go out without a scheduler.
Artisan::command('facilitycare:reminders', function () {
    $result = Reminders::run();
    $this->info("Overdue work orders reminded: {$result['overdue_work_orders']}");
    $this->info("Equipment due for maintenance: {$result['equipment_due']}");
})->purpose('Send overdue task and preventive maintenance reminders');

Schedule::command('facilitycare:reminders')->dailyAt('07:00');
