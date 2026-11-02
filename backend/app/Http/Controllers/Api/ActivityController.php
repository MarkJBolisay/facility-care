<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

/**
 * Repair request and activity history: who did what and when.
 * Filters: search (reference / description), action, user_id, report_id, work_order_id, equipment_id, from, to.
 */
class ActivityController extends Controller
{
    public function index(Request $request)
    {
        $query = ActivityLog::with([
            'user:id,name,role',
            'report:id,reference,title',
            'workOrder:id,reference,title',
            'equipment:id,code,name',
        ])->latest('created_at')->latest('id');

        foreach (['action', 'user_id', 'report_id', 'work_order_id', 'equipment_id'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->input('to'));
        }
        if ($request->filled('search')) {
            $s = '%'.$request->input('search').'%';
            $query->where(fn ($q) => $q->where('description', 'like', $s)
                ->orWhereHas('report', fn ($r) => $r->where('reference', 'like', $s))
                ->orWhereHas('workOrder', fn ($w) => $w->where('reference', 'like', $s))
                ->orWhereHas('equipment', fn ($e) => $e->where('code', 'like', $s)->orWhere('name', 'like', $s)));
        }

        return $query->paginate($request->integer('per_page', 30));
    }
}
