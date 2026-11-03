<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** What the reporter typed when they picked the "Others" category. */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->string('category_other', 100)->nullable()->after('category');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropColumn('category_other');
        });
    }
};
