<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * User Management: student, faculty, staff and technician accounts.
 * Administrator accounts are not listed, created or edited here (the admin uses their own Profile).
 */
class UserController extends Controller
{
    /** Roles that can be managed on this screen. */
    private const MANAGED_ROLES = ['maintenance', 'student', 'faculty', 'staff'];

    public function index(Request $request)
    {
        $query = User::query()->whereIn('role', self::MANAGED_ROLES)->orderBy('name');

        if ($request->filled('role')) {
            $query->where('role', $request->input('role'));
        }
        if ($request->filled('search')) {
            $s = '%'.$request->input('search').'%';
            $query->where(fn ($q) => $q->where('name', 'like', $s)
                ->orWhere('email', 'like', $s)
                ->orWhere('id_number', 'like', $s));
        }

        return $query->paginate($request->integer('per_page', 30));
    }

    /** Recipient counts per role, for the user screen header and notification targeting. */
    public function counts()
    {
        return User::whereIn('role', self::MANAGED_ROLES)
            ->selectRaw('role, count(*) as total')->groupBy('role')->pluck('total', 'role');
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules($request) + [
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
        ], $this->messages());

        return response()->json(User::create($data), 201);
    }

    public function show(User $user)
    {
        $this->ensureManaged($user);

        return $user->loadCount([
            'reports',
            'assignedWorkOrders as active_work_orders' => fn ($q) => $q->whereIn('status', ['pending', 'in_progress']),
            'assignedWorkOrders as completed_work_orders' => fn ($q) => $q->where('status', 'completed'),
        ]);
    }

    public function update(Request $request, User $user)
    {
        $this->ensureManaged($user);

        $data = $request->validate($this->rules($request, $user) + [
            'email' => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => 'nullable|string|min:6',
        ], $this->messages());

        if (empty($data['password'])) {
            unset($data['password']);
        }

        $user->update($data);

        return $user;
    }

    /**
     * Only an account with no history can be deleted (e.g. one made by mistake).
     * Deleting would also delete the person's reports, and leave their work orders without a technician.
     */
    public function destroy(Request $request, User $user)
    {
        $this->ensureManaged($user);

        $reports = $user->reports()->count();
        $workOrders = $user->assignedWorkOrders()->count();
        if ($reports || $workOrders) {
            $has = collect([
                $reports ? $reports.' '.str('report')->plural($reports) : null,
                $workOrders ? $workOrders.' '.str('work order')->plural($workOrders) : null,
            ])->filter()->implode(' and ');

            return response()->json([
                'message' => "This account has $has. Deactivate it instead so its history is kept.",
                'can_deactivate' => true,
            ], 422);
        }

        $user->tokens()->delete();
        $user->delete();

        return response()->noContent();
    }

    /** Administrator accounts are not handled on this screen. */
    private function ensureManaged(User $user): void
    {
        abort_unless(in_array($user->role, self::MANAGED_ROLES, true), 404, 'User not found.');
    }

    private function messages(): array
    {
        return [
            'id_number.regex' => 'Student ID must look like PPY2023-00249.',
            'id_number.unique' => 'This Student ID is already used by another account.',
            'role.in' => 'Choose Technician, Student, Faculty or Staff.',
        ];
    }

    private function rules(Request $request, ?User $user = null): array
    {
        // student IDs are stored in capitals (ppy2023-00249 -> PPY2023-00249)
        if (is_string($request->input('id_number'))) {
            $request->merge(['id_number' => strtoupper(trim($request->input('id_number'))) ?: null]);
        }

        return [
            'name' => 'required|string|max:255',
            'role' => ['required', Rule::in(self::MANAGED_ROLES)],
            'phone' => 'nullable|string|max:30',
            'department' => 'nullable|string|max:255',
            'id_number' => $request->input('role') === 'student'
                ? ['nullable', 'string', 'regex:'.User::STUDENT_ID_PATTERN, Rule::unique('users', 'id_number')->ignore($user?->id)]
                : ['nullable', 'string', 'max:50'],
            'specialization' => 'nullable|string|max:100',
            'is_active' => 'boolean',
            'is_available' => 'boolean',
        ];
    }
}
