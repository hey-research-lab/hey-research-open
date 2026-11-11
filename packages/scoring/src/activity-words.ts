/**
 * Activity status in words: the one table every surface reads (2026-10-01).
 *
 * The chip on the card and the project page, the Research Summary's build
 * line, the token lookup (`GET /api/token/{chain}/{address}`) and the partner
 * card all print the same words for the same project. Until this table moved
 * here, the words lived in `@hey/ui` (the chip) and a copy lived in the domain
 * (the summary), and the copy did not know why an UNKNOWN was unknown: the
 * page said "Activity not measurable" while the API said "Activity unknown"
 * for the same project (outsider usability test, 2026-10-01).
 *
 * Pure: no React, no database. `@hey/ui` adds its icons and colours on top,
 * and the domain imports the words directly.
 */
export type ActivityStatusWordsKey = 'SHIPPING' | 'ACTIVE' | 'QUIET' | 'DORMANT' | 'RESUMED' | 'UNKNOWN';

export const ACTIVITY_STATUS_WORDS: Readonly<Record<ActivityStatusWordsKey, { label: string; help: string }>> = {
  SHIPPING: { label: 'Shipping', help: 'Shipped something meaningful in the last 7 days.' },
  ACTIVE: { label: 'Active', help: 'Meaningful updates in the last month.' },
  QUIET: { label: 'Quiet', help: 'No meaningful updates for over a month.' },
  DORMANT: { label: 'Dormant', help: 'No meaningful updates observed for a long time. Not the same as abandoned.' },
  RESUMED: { label: 'Resumed building', help: 'Started shipping again after a long gap.' },
  UNKNOWN: { label: 'Not measured — activity unknown', help: 'Not enough public sources to judge activity yet.' },
};

/*
 * One chip for UNKNOWN (2026-10-28 simplicity study, CON-8): six phrasings had grown for one state that is 62% of the
 * catalogue — "Activity unknown", "No builder source linked", "Builder source held, not counted", "Activity not
 * measurable", "Not researched yet", "Building not checked yet". Each is now a reason under one head, "Not measured",
 * with the one separator (CON-10): a line of text prints "Not measured — no builder source linked", and the chip
 * prints the head with the reason as its second line (`activityChipWords`). The reasons and their help are unchanged.
 */
export const ACTIVITY_NOT_MEASURED_HEAD = 'Not measured';
const notMeasured = (reason: string): string => `${ACTIVITY_NOT_MEASURED_HEAD} — ${reason}`;

/** A status label as the chip draws it: the head, and the reason a "Not measured" label carries, capitalised for its own line. */
export function activityChipWords(label: string): { head: string; reason?: string } {
  const prefix = `${ACTIVITY_NOT_MEASURED_HEAD} — `;
  if (!label.startsWith(prefix)) return { head: label };
  const reason = label.slice(prefix.length);
  return { head: ACTIVITY_NOT_MEASURED_HEAD, reason: `${reason.charAt(0).toUpperCase()}${reason.slice(1)}` };
}

/**
 * UNKNOWN with nothing to read (2026-09-13). Most token projects HEY found
 * through trades hold no repository, changelog or feed, so "Activity unknown"
 * on them read as HEY not having looked. It looked; there is nothing to read
 * building from yet, and trading is not building.
 */
/*
 * "No builder source linked" since 2026-10-02 (outsider audit): "No builder
 * signal yet" beside $579M of TVL on Morpho Blue read as "nothing is being
 * built". What HEY knows is narrower — it has no repository, changelog or feed
 * linked to read building from — so the label says that, and a project with
 * no such source is never DORMANT ("we looked and saw nothing").
 */
export const NO_BUILDER_SIGNAL = {
  label: notMeasured('no builder source linked'),
  help: 'HEY has no repository, changelog or feed linked for this project, so whether it is building is not measured. It does not mean nothing is being built. Trading is not building.',
} as const;

/**
 * UNKNOWN with a ship on record and nothing HEY can keep reading
 * (data-correctness pass, 2026-09-28). A Verified Builder whose ships came
 * from a deployment, an X post or a repository now gone printed
 * "VERIFIED BUILDER" directly above "Activity unknown · Last ship 2mo ago":
 * a verdict and its opposite, with nothing joining them. Both are true — the
 * badge says HEY verified what it shipped, the status says HEY cannot tell
 * whether it is shipping now — so the label says why.
 */
export const ACTIVITY_NOT_MEASURABLE = {
  label: notMeasured('activity not measurable'),
  help: 'HEY has a ship on record but no repository, changelog or feed it can keep reading, so whether this project is building now cannot be judged. The last ship is the newest evidence HEY holds.',
} as const;

/**
 * UNKNOWN beside a builder source HEY holds only as context (2026-10-18, persona audit PB-11): the page listed
 * a GitHub repository under "No builder source linked … HEY has no repository linked", and the builder fixed the
 * wrong thing. HEY holds it; nothing yet ties it to the project, so it is not read as this project's building.
 * What would make it count is written under the source itself (`sources/context-words.ts`).
 */
export const BUILDER_SOURCE_HELD = {
  label: notMeasured('builder source held, not counted'),
  help: 'HEY holds a repository, changelog or feed for this project only as context: nothing yet ties it to the project, so whether it is building is not measured. Each source says what would make it count. It does not mean nothing is being built.',
} as const;

/**
 * UNKNOWN because every builder source stopped answering (2026-11-11, a private HEY record):
 * each repository, changelog and feed HEY read the project's building from answers 404 or is gone. The scorer files
 * it UNKNOWN 21 days after the last one went dark with no counted ship since (hbm-v37), and earlier when no counted
 * ship is in its window at all. A 404 is also what a renamed or moved repository returns, so the words say what HEY
 * read, never why.
 */
export const BUILDER_SOURCES_STOPPED = {
  label: notMeasured('builder sources stopped answering'),
  help: 'Every repository, changelog or feed HEY read this project’s building from stopped answering, so whether it is building now is not measured. A repository that was renamed or moved answers the same way. The ships HEY recorded before stay on the timeline.',
} as const;

/** Every own builder source unavailable, as the read layer carries it (`builderSourcesUnavailableSql`): the newest `unavailable_since` and how many. */
export type BuilderSourcesUnavailable = {
  /** The day the last builder source went dark (the newest `unavailable_since`). */
  since: Date | string;
  /** How many own builder sources (repositories, changelogs, feeds) are unavailable. */
  sourceCount: number;
  /** Every one of them is a GitHub repository; absent or false names them "builder sources". */
  repositoriesOnly?: boolean;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A UTC day as "3 Dec 2026", or "3 Dec" when `withYear` is false. Null for a date that does not parse. */
function utcDayWords(value: Date | string, withYear = true): string | null {
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const day = `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
  return withYear ? `${day} ${at.getUTCFullYear()}` : day;
}

/** The market statuses that add the liquidity clause to the line: what HEY reads as liquidity gone. */
const LIQUIDITY_GONE_CLAUSE: Readonly<Record<string, string>> = {
  LIQUIDITY_REMOVED: 'Liquidity no longer detected',
  NO_LIQUIDITY: 'No liquidity detected',
};

/**
 * Rule B of 2026-11-11 (display only, a private HEY record §3): the one dated line a page shows
 * when every own builder source stopped answering, the one function every surface prints it through (UI rule 15) —
 * the page header (`form: 'full'`), the card and the list row (`form: 'short'`), the Telegram card, the API, the MCP
 * and the explain engine.
 *
 *   full:  "HEY cannot read this project's building: its repository stopped answering on 3 Dec 2026."
 *          with the tracked token's market LIQUIDITY_REMOVED or NO_LIQUIDITY, the second fact in the market's own
 *          words: "… Liquidity no longer detected since 5 Dec 2026."
 *   short: "Repository not answering since 3 Dec" (the year when it is not `now`'s year).
 *
 * It states what HEY read and when, never why: it never says rug, scam, exit, abandoned, private or dead
 * (`activity-words.test.ts`). The liquidity clause rides only inside this line, a fact beside the building fact: it
 * decides nothing. Null when the date does not parse.
 */
export function builderSourcesGoneLine(input: {
  gone: BuilderSourcesUnavailable;
  form?: 'full' | 'short';
  /** The tracked token's market status, and when HEY first read it in that status (the market's own transition date). */
  market?: { status: string | null | undefined; since?: Date | string | null | undefined } | null | undefined;
  now?: Date;
}): string | null {
  const { gone } = input;
  const count = Math.max(1, Math.floor(gone.sourceCount));
  const repositories = gone.repositoriesOnly === true;
  if (input.form === 'short') {
    const now = input.now ?? new Date();
    const at = gone.since instanceof Date ? gone.since : new Date(gone.since);
    const day = utcDayWords(gone.since, !Number.isNaN(at.getTime()) && at.getUTCFullYear() !== now.getUTCFullYear());
    if (day === null) return null;
    const subject = count === 1 ? (repositories ? 'Repository' : 'Builder source') : `${count} ${repositories ? 'repositories' : 'builder sources'}`;
    return `${subject} not answering since ${day}`;
  }
  const day = utcDayWords(gone.since);
  if (day === null) return null;
  const building =
    count === 1
      ? `its ${repositories ? 'repository' : 'builder source'} stopped answering on ${day}.`
      : `its ${count} ${repositories ? 'repositories' : 'builder sources'} stopped answering, the last on ${day}.`;
  const status = input.market?.status;
  const clause = status && Object.hasOwn(LIQUIDITY_GONE_CLAUSE, status) ? LIQUIDITY_GONE_CLAUSE[status] : undefined;
  const marketDay = clause && input.market?.since ? utcDayWords(input.market.since) : null;
  const liquidity = clause ? ` ${clause}${marketDay ? ` since ${marketDay}` : ''}.` : '';
  return `HEY cannot read this project’s building: ${building}${liquidity}`;
}

/**
 * Why an UNKNOWN status is unknown, from facts every surface already
 * holds: the status, whether HEY reads a builder source (the scorer's
 * `observableBuilderSource`, selected as `hasBuilderSource`), whether it holds
 * one only as context (`heldBuilderSource`) and the last meaningful ship.
 *
 *   - `builder_sources_unavailable` — every builder source HEY read stopped answering (`builderSourcesUnavailable`,
 *     2026-11-11); it outranks the others, since it says which sources and that HEY read them;
 *   - `no_builder_signal` — nothing to read and nothing ever shipped;
 *   - `held_as_context` — nothing to read as the project's own, a builder source held as context, nothing shipped;
 *   - `no_readable_source` — a ship on record, and nothing HEY can keep reading;
 *   - `null` — not UNKNOWN, or UNKNOWN beside a source HEY reads ("Activity unknown").
 *
 * `hasBuilderSource` undefined means the caller does not know, and the words
 * stay the plain status word rather than guess; `heldBuilderSource` undefined
 * reads as no source held, the words before 2026-10-18.
 */
export type UnknownActivityReason = 'no_builder_signal' | 'held_as_context' | 'no_readable_source' | 'builder_sources_unavailable';

export function unknownActivityReason(project: {
  activityStatus: string;
  hasBuilderSource?: boolean | null | undefined;
  heldBuilderSource?: boolean | null | undefined;
  lastMeaningfulShipAt?: Date | string | null | undefined;
  builderSourcesUnavailable?: BuilderSourcesUnavailable | null | undefined;
}): UnknownActivityReason | null {
  if (project.activityStatus !== 'UNKNOWN') return null;
  if (project.builderSourcesUnavailable) return 'builder_sources_unavailable';
  if (project.hasBuilderSource === undefined || project.hasBuilderSource === null) return null;
  /*
   * A ship on record beside UNKNOWN is the scorer's "not enough source coverage" whatever the source flag reads now
   * (2026-10-28 simplicity study, DATA-10): the scorer files a project with a ship as UNKNOWN only when it found no
   * source it could keep reading (`deriveActivityStatus`'s `hasSourceCoverage`). A source read since, or one another
   * page holds, made 38 pages print a bare "Activity unknown" beside their last ship date; the next score decides.
   */
  if (project.lastMeaningfulShipAt) return 'no_readable_source';
  if (project.hasBuilderSource !== false) return null;
  return project.heldBuilderSource === true ? 'held_as_context' : 'no_builder_signal';
}

/** The words for a status, with the reason an UNKNOWN is unknown: the one label map every surface reads. */
export function activityPresentation(status: string, unknownReason?: UnknownActivityReason | null): { label: string; help: string } {
  if (status === 'UNKNOWN' && unknownReason === 'no_builder_signal') return { label: NO_BUILDER_SIGNAL.label, help: NO_BUILDER_SIGNAL.help };
  if (status === 'UNKNOWN' && unknownReason === 'held_as_context') return { label: BUILDER_SOURCE_HELD.label, help: BUILDER_SOURCE_HELD.help };
  if (status === 'UNKNOWN' && unknownReason === 'no_readable_source') return { label: ACTIVITY_NOT_MEASURABLE.label, help: ACTIVITY_NOT_MEASURABLE.help };
  if (status === 'UNKNOWN' && unknownReason === 'builder_sources_unavailable') return { label: BUILDER_SOURCES_STOPPED.label, help: BUILDER_SOURCES_STOPPED.help };
  const words = ACTIVITY_STATUS_WORDS[status as ActivityStatusWordsKey] ?? ACTIVITY_STATUS_WORDS.UNKNOWN;
  return { label: words.label, help: words.help };
}

/** The plain status word, without a reason: for a status change ("Quiet → Shipping") or a facet, where the reason is not part of the claim — UNKNOWN is the chip's head, "Not measured". */
export const activityStatusLabel = (status: string): string => activityChipWords((ACTIVITY_STATUS_WORDS[status as ActivityStatusWordsKey] ?? ACTIVITY_STATUS_WORDS.UNKNOWN).label).head;

/** The words for one project's status, from the facts every surface holds. */
export function projectActivityWords(project: {
  activityStatus: string;
  hasBuilderSource?: boolean | null | undefined;
  heldBuilderSource?: boolean | null | undefined;
  lastMeaningfulShipAt?: Date | string | null | undefined;
  builderSourcesUnavailable?: BuilderSourcesUnavailable | null | undefined;
}): { label: string; help: string } {
  return activityPresentation(project.activityStatus, unknownActivityReason(project));
}
