<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'Incorrect email or password.']);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages(['email' => 'This account is deactivated. Please contact the administrator.']);
        }

        return [
            'token' => $user->createToken('mobile')->plainTextToken,
            'user' => $user,
        ];
    }

    /** Self sign-up is only for students, faculty and staff. */
    public function register(Request $request)
    {
        // student IDs are stored in capitals (ppy2023-00249 -> PPY2023-00249)
        if (is_string($request->input('id_number'))) {
            $request->merge(['id_number' => strtoupper(trim($request->input('id_number'))) ?: null]);
        }

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => ['required', 'string', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols()],
            'role' => ['required', Rule::in(User::REPORTER_ROLES)],
            'department' => 'nullable|string|max:255',
            'id_number' => $request->input('role') === 'student'
                ? ['required', 'string', 'regex:'.User::STUDENT_ID_PATTERN, 'unique:users,id_number']
                : ['nullable', 'string', 'max:50'],
            'phone' => 'nullable|string|max:30',
        ], [
            'id_number.required' => 'Enter your Student ID.',
            'id_number.regex' => 'Student ID must look like PPY2023-00249.',
            'id_number.unique' => 'This Student ID is already registered.',
        ]);

        $user = User::create($data);

        return response()->json([
            'token' => $user->createToken('mobile')->plainTextToken,
            'user' => $user,
        ], 201);
    }

    public function me(Request $request)
    {
        return $request->user();
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'phone' => 'nullable|string|max:30',
            'department' => 'nullable|string|max:255',
            'is_available' => 'sometimes|boolean',
        ]);

        $user->update($data);

        return $user;
    }

    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => 'required|string',
            'password' => 'required|string|min:6|confirmed',
        ]);

        if (! Hash::check($data['current_password'], $request->user()->password)) {
            throw ValidationException::withMessages(['current_password' => 'Current password is incorrect.']);
        }

        $request->user()->update(['password' => $data['password']]);

        return ['message' => 'Password updated.'];
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return ['message' => 'Logged out.'];
    }
}
