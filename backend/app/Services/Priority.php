<?php

namespace App\Services;

use App\Models\Report;

/**
 * Automated repair request prioritization.
 *
 * Score (0–100) = equipment importance (up to 40)
 *               + reported severity   (up to 40)
 *               + waiting time        (up to 20, 2 points per day)
 *
 * Recommended level: 80+ Critical · 60+ High · 40+ Medium · below 40 Low.
 * The admin still decides; this is only a recommendation.
 */
class Priority
{
    private const IMPORTANCE_POINTS = ['high' => 40, 'medium' => 25, 'low' => 10];

    private const SEVERITY_POINTS = ['severe' => 40, 'moderate' => 25, 'minor' => 10];

    /** Used when there is no equipment / no severity given. */
    private const UNKNOWN_POINTS = 20;

    /** @return array{score:int, recommended:string, factors:array<int, array<string, mixed>>} */
    public static function assess(Report $report): array
    {
        $importance = $report->equipment?->importance;
        $severity = $report->severity;

        $importancePts = self::IMPORTANCE_POINTS[$importance] ?? self::UNKNOWN_POINTS;
        $severityPts = self::SEVERITY_POINTS[$severity] ?? self::UNKNOWN_POINTS;

        // Waiting time only grows while nobody has fixed it yet.
        $end = in_array($report->status, ['completed', 'rejected']) ? $report->updated_at : now();
        $days = (int) floor($report->created_at->diffInHours($end) / 24);
        $waitingPts = min(20, $days * 2);

        $score = $importancePts + $severityPts + $waitingPts;

        return [
            'score' => $score,
            'recommended' => self::levelFor($score),
            'factors' => [
                [
                    'label' => 'Equipment importance',
                    'value' => $importance ? ucfirst($importance) : ($report->equipment_id ? 'Medium' : 'No equipment selected'),
                    'points' => $importancePts,
                    'max' => 40,
                ],
                [
                    'label' => 'Reported severity',
                    'value' => $severity ? ucfirst($severity) : 'Not given',
                    'points' => $severityPts,
                    'max' => 40,
                ],
                [
                    'label' => 'Waiting time',
                    'value' => $days === 1 ? '1 day' : "$days days",
                    'points' => $waitingPts,
                    'max' => 20,
                ],
            ],
        ];
    }

    public static function score(Report $report): int
    {
        return self::assess($report)['score'];
    }

    public static function levelFor(int $score): string
    {
        return match (true) {
            $score >= 80 => 'critical',
            $score >= 60 => 'high',
            $score >= 40 => 'medium',
            default => 'low',
        };
    }
}
