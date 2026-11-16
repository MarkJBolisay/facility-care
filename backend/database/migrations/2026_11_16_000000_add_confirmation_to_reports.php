<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * After a repair the reporter confirms it is fixed (confirmed_at)
     * or says it is still broken, which reopens the request (reopen_count).
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->timestamp('confirmed_at')->nullable()->after('reviewed_at');
            $table->unsignedInteger('reopen_count')->default(0)->after('confirmed_at');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropColumn(['confirmed_at', 'reopen_count']);
        });
    }
};
