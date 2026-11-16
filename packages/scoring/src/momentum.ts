import type { BuildMomentumWithheldReason } from './withheld-words';

type MomentumProfile = {
  score?: { hbm?: number; components?: unknown } | undefined;
  activityResearched?: boolean | undefined;
  /**
   * Required (possibly undefined) so no reader can forget it: the status decides whether the score is shown
   * (2026-11-15). An undefined status is a profile read before statuses existed and is not withheld by it.
   */
  activityStatus: string | undefined;
};

/**
 * Why a project's Build Momentum is not published, or undefined when it is (founder, 2026-11-15, "yes"). The one
 * rule every surface reads — the page, the Terminal, the API, the snapshot, the MCP, the explain engine, Ask HEY:
 *
 * - An activity status of UNKNOWN is "HEY does not measure this project's building" (the status half of
 *   `activityMeasuredSql`), so no stored score is shown beside it, positive or not: /project/pingapp printed "Build
 *   Momentum 26" beside "Not measured" after every repository stopped answering. Display only: the stored score, the
 *   scorer and every ranking that reads `project_score_current` are unchanged.
 * - Elsewhere a positive score is a measurement (10-agent audit, 2026-09-25): it came from evidence HEY scored, and
 *   hiding it made the Overview read "not measured" beside a Radar rank one tab away.
 * - A zero is a measurement only on a project whose activity research ran (A10-12, 2026-09-25): an unresearched 0 is
 *   "HEY found nothing it could read", never "measured, nothing found".
 */
export function buildMomentumWithheldOf(profile: MomentumProfile): BuildMomentumWithheldReason | undefined {
  const hbm = profile.score?.hbm;
  if (profile.activityStatus === 'UNKNOWN') {
    const components = profile.score?.components;
    const unknownReason = components && typeof components === 'object' ? (components as Record<string, unknown>)['activityUnknownReason'] : undefined;
    return unknownReason === 'builder_sources_unavailable' ? 'builder_sources_unavailable' : 'activity_unknown';
  }
  if (hbm === undefined) return 'not_scored';
  if (hbm > 0) return undefined;
  return profile.activityResearched === true ? undefined : 'not_researched';
}

/**
 * Whether a project's Build Momentum is a measurement HEY publishes: `buildMomentumWithheldOf` gives no reason.
 * Every surface that prints the figure gates on this (or on the reason itself), so the figure shown is exactly the
 * figure measured.
 */
export function momentumMeasured<P extends MomentumProfile>(profile: P): profile is P & { score: NonNullable<P['score']> & { hbm: number } } {
  return profile.score?.hbm !== undefined && buildMomentumWithheldOf(profile) === undefined;
}

/** The published figure, or null with the reason (machine rule 4: never a 0 for "not measured"). */
export function publishedBuildMomentum(profile: MomentumProfile): { value: number; withheld?: undefined } | { value: null; withheld: BuildMomentumWithheldReason } {
  const withheld = buildMomentumWithheldOf(profile);
  const hbm = profile.score?.hbm;
  if (withheld === undefined && hbm !== undefined) return { value: hbm };
  return { value: null, withheld: withheld ?? 'not_scored' };
}
