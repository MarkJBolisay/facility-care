<?php

use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EquipmentController;
use App\Http\Controllers\Api\FacilityController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\TechnicianController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WorkOrderController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);

Route::middleware('auth:sanctum')->group(function () {
    // Account
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/me', [AuthController::class, 'updateProfile']);
    Route::put('/me/password', [AuthController::class, 'changePassword']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Dashboard (content depends on role)
    Route::get('/dashboard', DashboardController::class);

    // Notifications inbox (everyone)
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);

    // Facilities list is needed by everyone (report form, work orders)
    Route::get('/facilities', [FacilityController::class, 'index']);
    Route::get('/facilities/{facility}', [FacilityController::class, 'show']);

    // Equipment list/profile is needed by everyone (requesters pick the item they are reporting)
    Route::get('/equipment', [EquipmentController::class, 'index']);
    Route::get('/equipment/summary', [EquipmentController::class, 'summary'])->middleware('role:admin,maintenance');
    Route::get('/equipment/{equipment}', [EquipmentController::class, 'show']);
    Route::get('/equipment/{equipment}/history', [EquipmentController::class, 'history'])->middleware('role:admin,maintenance');

    // Reports: reporters submit/see their own, admin sees all
    Route::get('/reports', [ReportController::class, 'index']);
    Route::post('/reports', [ReportController::class, 'store'])->middleware('role:student,faculty,staff,admin');
    Route::get('/reports/{report}', [ReportController::class, 'show']);
    Route::delete('/reports/{report}', [ReportController::class, 'destroy']);
    // After the repair the reporter says it is fixed, or that it is still broken (reopens the request)
    Route::post('/reports/{report}/confirm', [ReportController::class, 'confirm']);
    Route::post('/reports/{report}/reopen', [ReportController::class, 'reopen']);

    // Work orders: maintenance sees/updates their own, admin all
    Route::get('/work-orders', [WorkOrderController::class, 'index'])->middleware('role:admin,maintenance');
    Route::get('/work-orders/{workOrder}', [WorkOrderController::class, 'show']);
    Route::middleware('role:admin,maintenance')->group(function () {
        Route::post('/work-orders/{workOrder}/status', [WorkOrderController::class, 'updateStatus']);
        Route::post('/work-orders/{workOrder}/photos', [WorkOrderController::class, 'addPhoto']);
        Route::delete('/work-order-photos/{photo}', [WorkOrderController::class, 'deletePhoto']);
        Route::post('/work-orders/{workOrder}/materials', [WorkOrderController::class, 'addMaterial']);
        Route::delete('/work-order-materials/{material}', [WorkOrderController::class, 'deleteMaterial']);
    });

    // Admin only
    Route::middleware('role:admin')->group(function () {
        Route::put('/reports/{report}', [ReportController::class, 'update']);
        Route::post('/reports/{report}/approve', [ReportController::class, 'approve']);
        Route::post('/reports/{report}/reject', [ReportController::class, 'reject']);

        Route::get('/personnel', [WorkOrderController::class, 'personnel']);
        Route::post('/work-orders', [WorkOrderController::class, 'store']);
        Route::put('/work-orders/{workOrder}', [WorkOrderController::class, 'update']);
        Route::delete('/work-orders/{workOrder}', [WorkOrderController::class, 'destroy']);

        Route::post('/facilities', [FacilityController::class, 'store']);
        Route::put('/facilities/{facility}', [FacilityController::class, 'update']);
        Route::delete('/facilities/{facility}', [FacilityController::class, 'destroy']);

        Route::get('/users/counts', [UserController::class, 'counts']);
        Route::apiResource('users', UserController::class);

        Route::get('/analytics', AnalyticsController::class);

        Route::post('/equipment', [EquipmentController::class, 'store']);
        Route::put('/equipment/{equipment}', [EquipmentController::class, 'update']);
        Route::delete('/equipment/{equipment}', [EquipmentController::class, 'destroy']);
        Route::get('/preventive-maintenance', [EquipmentController::class, 'preventive']);
        Route::post('/equipment/{equipment}/schedule', [EquipmentController::class, 'schedule']);

        Route::get('/technicians', [TechnicianController::class, 'index']);
        Route::get('/technicians/{technician}', [TechnicianController::class, 'show']);
        Route::put('/technicians/{technician}', [TechnicianController::class, 'update']);

        Route::get('/activity', [ActivityController::class, 'index']);

        Route::post('/notifications/send', [NotificationController::class, 'send']);
        Route::get('/notifications/sent', [NotificationController::class, 'sent']);
    });

    // Facility maintenance history: admin and maintenance
    Route::get('/facilities/{facility}/history', [FacilityController::class, 'history'])->middleware('role:admin,maintenance');
});
