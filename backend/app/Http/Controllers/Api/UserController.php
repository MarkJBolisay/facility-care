<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::query()->orderBy('name');

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
        return User::selectRaw('role, count(*) as total')->groupBy('role')->pluck('total', 'role');
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
        return $user->loadCount([
            'reports',
            'assignedWorkOrders as active_work_orders' => fn ($q) => $q->whereIn('status', ['pending', 'in_progress']),
            'assignedWorkOrders as completed_work_orders' => fn ($q) => $q->where('status', 'completed'),
        ]);
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate($this->rules($request, $user) + [
            'email' => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => 'nullable|string|min:6',
        ], $this->messages());

        if (empty($data['password'])) {
            unset($data['password']);
        }

        // Don't let an admin lock themselves out.
        if ($user->id === $request->user()->id) {
            $data['role'] = 'admin';
            $data['is_active'] = true;
        }

        $user->update($data);

        return $user;
    }

    public function destroy(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }

        $user->tokens()->delete();
        $user->delete();

        return response()->noContent();
    }

    private function messages(): array
    {
        return [
            'id_number.regex' => 'Student ID must look like PPY2023-00249.',
            'id_number.unique' => 'This Student ID is already used by another account.',
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
            'role' => ['required', Rule::in(User::ROLES)],
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
