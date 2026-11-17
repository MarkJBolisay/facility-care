<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Wrong passwords allowed per email (from one device/network) before a one-minute wait. */
    private const LOGIN_TRIES = 5;

    /** Sign-ups allowed per minute from one network (a classroom shares one, so not too low). */
    private const REGISTER_TRIES = 20;

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        // stop password guessing: 5 wrong tries, then wait a minute (only for this email from this network)
        $key = 'login:'.strtolower($data['email']).'|'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, self::LOGIN_TRIES)) {
            $this->tooMany(RateLimiter::availableIn($key), 'login attempts');
        }

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($key, 60);
            throw ValidationException::withMessages(['email' => 'Incorrect email or password.']);
        }

        RateLimiter::clear($key);

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
        $key = 'register:'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, self::REGISTER_TRIES)) {
            $this->tooMany(RateLimiter::availableIn($key), 'sign-up attempts');
        }
        RateLimiter::hit($key, 60);

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

    /** 429 with how long to wait, e.g. "Too many login attempts. Please wait 42 seconds and try again." */
    private function tooMany(int $seconds, string $what): never
    {
        $seconds = max(1, $seconds);
        throw ValidationException::withMessages([
            'email' => "Too many $what. Please wait $seconds ".str('second')->plural($seconds).' and try again.',
        ])->status(429);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return ['message' => 'Logged out.'];
    }
}
