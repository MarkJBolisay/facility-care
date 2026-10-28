<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\Report;
use App\Models\User;
use App\Services\Notifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    /** The signed-in user's inbox. */
    public function index(Request $request)
    {
        return $request->user()->appNotifications()
            ->with('sender:id,name')
            ->latest()
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 30));
    }

    public function unreadCount(Request $request)
    {
        return ['count' => $request->user()->appNotifications()->whereNull('read_at')->count()];
    }

    public function markRead(Request $request, AppNotification $notification)
    {
        abort_unless((int) $notification->user_id === (int) $request->user()->id, 403);
        $notification->update(['read_at' => now()]);

        return $notification;
    }

    public function markAllRead(Request $request)
    {
        $request->user()->appNotifications()->whereNull('read_at')->update(['read_at' => now()]);

        return ['message' => 'All notifications marked as read.'];
    }

    /**
     * Admin: send an update to one or more users, a whole role, everyone,
     * or the people involved in a repair request.
     */
    public function send(Request $request)
    {
        $data = $request->validate([
            'target' => ['required', Rule::in(['users', 'role', 'all', 'report'])],
            'user_ids' => 'required_if:target,users|array',
            'user_ids.*' => 'exists:users,id',
            'role' => ['required_if:target,role', 'nullable', Rule::in(User::ROLES)],
            'report_id' => 'required_if:target,report|nullable|exists:reports,id',
            'title' => 'required|string|max:255',
            'message' => 'required|string|max:2000',
        ]);

        $report = null;

        $ids = match ($data['target']) {
            'users' => $data['user_ids'],
            'role' => User::where('role', $data['role'])->where('is_active', true)->pluck('id')->all(),
            'all' => User::where('is_active', true)->where('id', '!=', $request->user()->id)->pluck('id')->all(),
            'report' => (function () use ($data, &$report) {
                $report = Report::with('workOrders')->findOrFail($data['report_id']);

                // Reporter plus whoever is assigned to fix it.
                return collect([$report->user_id])
                    ->merge($report->workOrders->pluck('assigned_to'))
                    ->filter()->unique()->all();
            })(),
        };

        if (! $ids) {
            return response()->json(['message' => 'No recipients found.'], 422);
        }

        $batch = Notifier::send($ids, $data['title'], $data['message'], 'announcement', $report, null, $request->user());

        return response()->json(['batch_id' => $batch, 'recipients' => count($ids)], 201);
    }

    /** Admin: history of manually sent updates, one row per send. */
    public function sent(Request $request)
    {
        return AppNotification::query()
            ->where('type', 'announcement')
            ->select('batch_id', 'title', 'message', 'sent_by', 'report_id',
                DB::raw('count(*) as recipients'),
                DB::raw('sum(case when read_at is not null then 1 else 0 end) as read_count'),
                DB::raw('max(created_at) as created_at'))
            ->groupBy('batch_id', 'title', 'message', 'sent_by', 'report_id')
            ->orderByDesc('created_at')
            ->with('sender:id,name')
            ->paginate($request->integer('per_page', 20));
    }
}
