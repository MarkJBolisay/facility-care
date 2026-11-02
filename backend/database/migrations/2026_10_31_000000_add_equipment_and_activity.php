<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Equipment profiles, preventive maintenance schedule, and the activity log.
 * Also links repair requests and work orders to a piece of equipment.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('equipment', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();                 // Equipment ID, e.g. EQ-0001
            $table->string('name');
            $table->string('category')->index();              // computer, aircon, projector, ...
            $table->string('model')->nullable();
            $table->string('serial_number')->nullable();
            $table->string('department')->nullable();
            $table->foreignId('facility_id')->nullable()->constrained()->nullOnDelete(); // location
            $table->date('acquisition_date')->nullable();
            // operational | needs_repair | under_maintenance | out_of_service
            $table->string('condition')->default('operational')->index();
            // low | medium | high — how much classes/offices depend on it (used for priority scoring)
            $table->string('importance')->default('medium');
            $table->unsignedInteger('maintenance_interval_days')->nullable(); // preventive schedule
            $table->date('last_maintained_at')->nullable();
            $table->timestamp('last_reminded_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::table('reports', function (Blueprint $table) {
            $table->foreignId('equipment_id')->nullable()->after('facility_id')->constrained('equipment')->nullOnDelete();
            $table->string('severity')->nullable()->after('category'); // minor | moderate | severe
        });

        Schema::table('work_orders', function (Blueprint $table) {
            $table->foreignId('equipment_id')->nullable()->after('facility_id')->constrained('equipment')->nullOnDelete();
            $table->string('type')->default('corrective')->after('category'); // corrective | preventive
            $table->string('condition_after')->nullable()->after('remarks');
            $table->timestamp('overdue_notified_at')->nullable();
        });

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // who did it
            $table->string('action')->index();       // submitted, approved, assigned, status_changed, ...
            $table->string('description');
            $table->string('from_value')->nullable();
            $table->string('to_value')->nullable();
            $table->foreignId('report_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('work_order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('equipment_id')->nullable()->constrained('equipment')->nullOnDelete();
            $table->timestamp('created_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
        Schema::table('work_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('equipment_id');
            $table->dropColumn(['type', 'condition_after', 'overdue_notified_at']);
        });
        Schema::table('reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('equipment_id');
            $table->dropColumn('severity');
        });
        Schema::dropIfExists('equipment');
    }
};
