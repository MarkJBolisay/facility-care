<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A deactivated account is signed out on its next request, even on a phone that was already logged in.
 * Answers 401 so the app goes back to the login screen. Old logins are removed when the account is turned back on (see User).
 */
class EnsureActive
{
    public const MESSAGE = 'This account is deactivated. Please contact the administrator.';

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Every request from a deactivated account is refused with the reason (the token is kept so each
        // request, even one that was already on its way, gets the same clear answer).
        if ($user && ! $user->is_active) {
            return response()->json(['message' => self::MESSAGE, 'deactivated' => true], 401);
        }

        return $next($request);
    }
}
