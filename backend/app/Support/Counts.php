<?php

namespace App\Support;

/** Turns counts into words for messages: ['report' => 3, 'work order' => 1] → "3 reports and 1 work order". */
class Counts
{
    /** @param array<string, int> $counts */
    public static function describe(array $counts): string
    {
        $parts = [];
        foreach ($counts as $noun => $n) {
            if ($n > 0) {
                $parts[] = $n.' '.str($noun)->plural($n);
            }
        }

        if (count($parts) < 2) {
            return $parts[0] ?? '';
        }

        $last = array_pop($parts);

        return implode(', ', $parts).' and '.$last;
    }
}
