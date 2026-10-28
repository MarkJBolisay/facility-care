<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

/**
 * Saves uploaded photos straight into public/uploads so they are served
 * by the web server without needing `storage:link` (symlinks are awkward on Windows).
 */
class Uploads
{
    public static function store(UploadedFile $file, string $folder): string
    {
        $dir = public_path("uploads/$folder");
        File::ensureDirectoryExists($dir);

        $name = now()->format('YmdHis').'_'.Str::random(8).'.'.($file->guessExtension() ?: 'jpg');
        $file->move($dir, $name);

        return "uploads/$folder/$name";
    }

    public static function delete(?string $path): void
    {
        if ($path && str_starts_with($path, 'uploads/')) {
            File::delete(public_path($path));
        }
    }
}
