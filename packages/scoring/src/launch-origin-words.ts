/**
 * Where a token launched, as one union and one set of words (2026-11-12, state-machine audit F5).
 *
 * The launch provenance (`launchedViaFrom`, `@hey/domain` card fields) names a launchpad, or one of two placeholders:
 * "Unknown" for a token HEY holds no launch record for, "Independent" for a project with no token. Those strings are
 * stored in JSON that partners read (`/api/search/suggest`'s launch rows, the MCP identity search), so they stay as they
 * are (machine rule 10; dropping them needs a ruling). Five readers filtered them, each its own way: the type-ahead
 * printed "via Unknown", the Terminal and the card "via Independent". Every reader now reads the name through
 * {@link launchOriginOf} and prints {@link launchOriginWords}: a launchpad is "via <name>"; the placeholders never take
 * "via".
 *
 * A word module: it imports nothing at run time (`word-modules.test.ts`).
 */

/** The placeholder names `launchedViaFrom` writes, as stored in JSON (never renamed). */
export const LAUNCH_ORIGIN_NOT_OBSERVED_NAME = 'Unknown';
export const LAUNCH_ORIGIN_NO_TOKEN_NAME = 'Independent';

export type LaunchOrigin =
  /** A launchpad HEY read the launch from (its launch record or factory log). */
  | { kind: 'launchpad'; name: string; url?: string }
  /** A token HEY holds no launch record for. */
  | { kind: 'not_observed' }
  /** A project with no token: there was no launch to observe. */
  | { kind: 'no_token' };

/**
 * The origin a stored launch name stands for: a placeholder (either spelling's case), an empty or absent name, or a
 * launchpad. Absent reads as not observed: unknown is never a launchpad.
 */
export function launchOriginOf(via: { name: string; url?: string | undefined } | string | null | undefined): LaunchOrigin {
  const name = (typeof via === 'string' ? via : via?.name)?.trim();
  if (!name || name.toLowerCase() === LAUNCH_ORIGIN_NOT_OBSERVED_NAME.toLowerCase()) return { kind: 'not_observed' };
  if (name.toLowerCase() === LAUNCH_ORIGIN_NO_TOKEN_NAME.toLowerCase()) return { kind: 'no_token' };
  const url = typeof via === 'object' && via?.url ? via.url : undefined;
  return url ? { kind: 'launchpad', name, url } : { kind: 'launchpad', name };
}

/** Whether a stored launch name names a launchpad HEY observed (the suggest answer's additive `launchedViaObserved`). */
export const launchOriginObserved = (via: { name: string } | string | null | undefined): boolean => launchOriginOf(via).kind === 'launchpad';

/** The card's words when HEY holds no launch record: never "via Unknown" (2026-10-12, audit RD-10). */
export const LAUNCH_NOT_OBSERVED_WORDS = 'Launch not observed';
/** The card's word for a project with no token. Never "via Independent". */
export const LAUNCH_NO_TOKEN_WORDS = 'Independent';

export type LaunchOriginWords = {
  /** The launchpad's name, or null when there is none to name. */
  launchpad: string | null;
  /** The short label a card cell prints: the launchpad's name, or the placeholder's words. */
  label: string;
  /** "via Pons" for a launchpad; null for a placeholder, which never takes "via". */
  via: string | null;
};

export function launchOriginWords(origin: LaunchOrigin): LaunchOriginWords {
  switch (origin.kind) {
    case 'launchpad':
      return { launchpad: origin.name, label: origin.name, via: `via ${origin.name}` };
    case 'not_observed':
      return { launchpad: null, label: LAUNCH_NOT_OBSERVED_WORDS, via: null };
    case 'no_token':
      return { launchpad: null, label: LAUNCH_NO_TOKEN_WORDS, via: null };
  }
}

/** The launchpad's name for a stored launch name, or undefined for a placeholder: the readers that print only a launchpad. */
export const launchpadNameOf = (via: { name: string } | string | null | undefined): string | undefined => launchOriginWords(launchOriginOf(via)).launchpad ?? undefined;
