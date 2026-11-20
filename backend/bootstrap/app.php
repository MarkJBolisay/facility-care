<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureRole::class,
            'active' => \App\Http\Middleware\EnsureActive::class,
        ]);

        // Never try to resolve a web "login" route for an API request. This
        // build has no web login route; doing so turned every unauthenticated
        // /api call into a 500 instead of the expected JSON 401.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : url('/'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Always answer API calls with JSON errors (the mobile app expects JSON).
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
    })->create();
