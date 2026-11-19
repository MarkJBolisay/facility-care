<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Five-stage repair workflow:
 *   Reported → Pending → In Progress → Nearing Completion → Completed.
 *
 * Each stage keeps its own remarks and photo proof, and materials now carry a
 * purpose plus a photo. Nothing from an earlier stage is reused as proof.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('work_orders', function (Blueprint $table) {
            $table->timestamp('nearing_completion_at')->nullable()->after('started_at');
            $table->foreignId('completed_by')->nullable()->after('completed_at')->constrained('users')->nullOnDelete();
            // Required when the technician records "No materials used".
            $table->text('no_materials_reason')->nullable()->after('remarks');
        });

        Schema::table('work_order_photos', function (Blueprint $table) {
            // reported | pending | in_progress | nearing_completion | completed
            $table->string('stage')->nullable()->index()->after('type');
            $table->text('remarks')->nullable()->after('stage');
        });

        Schema::table('work_order_materials', function (Blueprint $table) {
            $table->text('purpose')->nullable()->after('unit');
            $table->string('photo')->nullable()->after('purpose');
            $table->foreignId('added_by')->nullable()->after('photo')->constrained('users')->nullOnDelete();
            $table->timestamp('used_at')->nullable()->after('added_by');
        });

        // One row per completed stage: who submitted it, when, and the remarks.
        Schema::create('work_order_stages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_order_id')->constrained()->cascadeOnDelete();
            $table->string('stage')->index();
            $table->text('remarks')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->nullable()->index();
            $table->unique(['work_order_id', 'stage']);
        });

        // Keep the history of work orders that existed before this upgrade.
        $now = now();
        DB::table('work_orders')->orderBy('id')->each(function ($wo) use ($now) {
            $stages = [['pending', $wo->created_at ?? $now]];
            if ($wo->started_at) {
                $stages[] = ['in_progress', $wo->started_at];
            }
            if ($wo->completed_at) {
                $stages[] = ['completed', $wo->completed_at];
            }
            foreach ($stages as [$stage, $at]) {
                DB::table('work_order_stages')->insertOrIgnore([
                    'work_order_id' => $wo->id,
                    'stage' => $stage,
                    'remarks' => null,
                    'user_id' => null,
                    'created_at' => $at,
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_order_stages');

        Schema::table('work_order_materials', function (Blueprint $table) {
            $table->dropConstrainedForeignId('added_by');
            $table->dropColumn(['purpose', 'photo', 'used_at']);
        });

        Schema::table('work_order_photos', function (Blueprint $table) {
            $table->dropColumn(['stage', 'remarks']);
        });

        Schema::table('work_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('completed_by');
            $table->dropColumn(['nearing_completion_at', 'no_materials_reason']);
        });
    }
};
