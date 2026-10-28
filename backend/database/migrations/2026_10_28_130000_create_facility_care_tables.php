<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('facilities', function (Blueprint $table) {
            $table->id();
            $table->string('code')->nullable()->unique();
            $table->string('name');
            // building | room | laboratory | office | restroom | outdoor | other
            $table->string('type')->default('room')->index();
            // Rooms and labs belong to a building
            $table->foreignId('parent_id')->nullable()->constrained('facilities')->nullOnDelete();
            $table->string('floor')->nullable();
            $table->unsignedInteger('capacity')->nullable();
            $table->text('description')->nullable();
            // operational | under_maintenance | closed
            $table->string('status')->default('operational');
            $table->timestamps();
        });

        Schema::create('reports', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('facility_id')->nullable()->constrained()->nullOnDelete();
            $table->string('location_details')->nullable();
            $table->string('title');
            $table->text('description');
            $table->string('category')->nullable()->index();
            // low | medium | high | critical
            $table->string('priority')->nullable()->index();
            // pending | approved | rejected | in_progress | completed
            $table->string('status')->default('pending')->index();
            $table->string('photo')->nullable();
            $table->text('admin_remarks')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('work_orders', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->foreignId('report_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('facility_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('category')->nullable();
            $table->string('priority')->default('medium')->index();
            // pending | in_progress | completed | cancelled
            $table->string('status')->default('pending')->index();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('assigned_at')->nullable();
            $table->date('due_date')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('actions_taken')->nullable();
            $table->text('remarks')->nullable();
            $table->timestamps();
        });

        Schema::create('work_order_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_order_id')->constrained()->cascadeOnDelete();
            // before | after
            $table->string('type');
            $table->string('path');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('work_order_materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_order_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            // material | equipment
            $table->string('type')->default('material');
            $table->decimal('quantity', 10, 2)->default(1);
            $table->string('unit')->nullable();
            $table->decimal('unit_cost', 12, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('app_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('message');
            // info | report | assignment | status | announcement
            $table->string('type')->default('info');
            $table->foreignId('report_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('work_order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('batch_id')->nullable()->index();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_notifications');
        Schema::dropIfExists('work_order_materials');
        Schema::dropIfExists('work_order_photos');
        Schema::dropIfExists('work_orders');
        Schema::dropIfExists('reports');
        Schema::dropIfExists('facilities');
    }
};
