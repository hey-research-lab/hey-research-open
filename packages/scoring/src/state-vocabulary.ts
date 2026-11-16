/**
 * HEY's public state vocabularies, declared once (2026-11-13, state-machine audit: "one declared registry").
 *
 * Two audits in five days (2026-11-09, 2026-11-12) found the same pattern: a state or reason was added where it is
 * decided, and the surfaces that print it — the page, the bot, the API, the SDK, MCP, the agent contract, the explain
 * engine — kept their own copy of the list or its words, so a new reason read as an older one, or as nothing. This
 * module names every state machine a reader or an agent meets, with:
 *
 *  - `codes`: every value HEY writes, read from the word module that already owns the list (nothing is copied here);
 *  - `notKnown`: the codes that mean HEY could not measure or read — never a zero, a "no" or a pass (machine rule 4);
 *  - `words`: the reader's words for each code, from the same table every surface reads;
 *  - `fields`: where the code appears on HEY's public JSON, so the OpenAPI document can name its known values.
 *
 * It decides nothing: the deciding functions stay in the scorer and the domain. It imports only the word modules, which
 * import nothing at run time, so the MCP bundle and the agent contract can read it. `state-vocabulary.test.ts` holds
 * every entry to its tables (each code has words, `notKnown` is a subset, no code twice), and the web app's OpenAPI
 * test holds each documented field's `x-hey-known-values` to `codes`.
 *
 * The values are open: a partner must read an unknown value as unknown, never fail on it (machine rule 10). That is
 * why the OpenAPI document lists them as known values and not as a closed `enum`.
 */
import {
  ACTIVITY_STATUS_WORDS,
  UNKNOWN_ACTIVITY_REASON_WORDS,
  UNKNOWN_ACTIVITY_REASONS,
  type ActivityStatusWordsKey,
} from './activity-words';
import { TOKEN_MARKET_LABELS, TOKEN_MARKET_REASON_WORDS } from './market-status-words';
import { RESEARCH_LEVEL_WORDS, type ResearchLevelWordsKey } from './research-level-words';
import {
  SHIP_VERIFICATION_WORDS,
  TOKEN_REASON_SENTENCES,
  TOKEN_VERIFICATION_REASONS,
  TOKEN_VERIFICATION_WORDS,
  type TokenVerificationWordsKey,
} from './verification-words';
import {
  DISCOVERY_GAP_WITHHELD_REASONS,
  DISCOVERY_GAP_WITHHELD_WORDS,
  STILL_BUILDING_WITHHELD_REASONS,
  STILL_BUILDING_WITHHELD_WORDS,
} from './withheld-words';
import { OFFICIAL_X_LINK_HOLD_WORDS, OFFICIAL_X_LINK_HOLDS } from './x-account-words';

export type StateVocabulary = {
  /** Stable kebab-case id; never renamed (a doc or an agent may cite it). */
  id: string;
  /** The machine in a few words. */
  title: string;
  /** What the value says, in one sentence a reader or an agent can quote. */
  meaning: string;
  /** Every value HEY writes. */
  codes: readonly string[];
  /** The values that mean HEY could not measure or read: unknown, never zero (machine rule 4). */
  notKnown: readonly string[];
  /** A value's words, from the table every surface reads. */
  words: (code: string) => string;
  /** Where the value appears on HEY's public JSON (`Schema.field` in the OpenAPI document). */
  fields: readonly string[];
};

const keysOf = <K extends string>(table: Readonly<Record<K, unknown>>): readonly K[] => Object.keys(table) as K[];

export const STATE_VOCABULARIES: readonly StateVocabulary[] = [
  {
    id: 'activity-status',
    title: 'Activity status',
    meaning: 'What HEY claims about a project’s building, from meaningful builder activity it reads — never from price.',
    codes: keysOf(ACTIVITY_STATUS_WORDS),
    notKnown: ['UNKNOWN'],
    words: (code) => (ACTIVITY_STATUS_WORDS[code as ActivityStatusWordsKey] ?? ACTIVITY_STATUS_WORDS.UNKNOWN).label,
    fields: ['Project.activityStatus'],
  },
  {
    id: 'activity-unknown-reason',
    title: 'Why activity is unknown',
    meaning: 'Why HEY cannot measure a project’s building: a gap in what HEY reads, never a finding about the team.',
    codes: UNKNOWN_ACTIVITY_REASONS,
    notKnown: UNKNOWN_ACTIVITY_REASONS,
    words: (code) => UNKNOWN_ACTIVITY_REASON_WORDS[code as (typeof UNKNOWN_ACTIVITY_REASONS)[number]]?.label ?? '',
    fields: ['ProjectActivity.unknownReason'],
  },
  {
    id: 'research-level',
    title: 'Research level',
    meaning: 'How far HEY’s research on a project went; public pages draw only the Verified Builder badge.',
    codes: keysOf(RESEARCH_LEVEL_WORDS),
    notKnown: [],
    words: (code) => (RESEARCH_LEVEL_WORDS[code as ResearchLevelWordsKey] ?? RESEARCH_LEVEL_WORDS.INDEXED).label,
    fields: ['Project.researchLevel'],
  },
  {
    id: 'token-market-status',
    title: 'Token market status',
    meaning: 'What HEY reads of the tracked token’s market: context only, never an input to activity status or Build Momentum.',
    codes: keysOf(TOKEN_MARKET_LABELS),
    notKnown: ['INSUFFICIENT_DATA'],
    words: (code) => TOKEN_MARKET_LABELS[code as keyof typeof TOKEN_MARKET_LABELS] ?? '',
    fields: ['TokenMarketState.status', 'TokenMarketDetail.status'],
  },
  {
    id: 'token-market-reason',
    title: 'Why the market reads as it does',
    meaning: 'The classifier’s reason behind a token’s market status.',
    codes: keysOf(TOKEN_MARKET_REASON_WORDS),
    notKnown: [],
    words: (code) => TOKEN_MARKET_REASON_WORDS[code as keyof typeof TOKEN_MARKET_REASON_WORDS] ?? '',
    fields: ['TokenMarketState.reason', 'TokenMarketDetail.reason'],
  },
  {
    id: 'token-verification',
    title: 'Whether the project names its token',
    meaning: 'Whether the project itself ties the tracked contract to the project: its site, its own repository, or an on-chain signature.',
    codes: keysOf(TOKEN_VERIFICATION_WORDS),
    notKnown: [],
    words: (code) => (TOKEN_VERIFICATION_WORDS[code as TokenVerificationWordsKey] ?? TOKEN_VERIFICATION_WORDS.UNVERIFIED).label,
    fields: ['TokenVerification.status'],
  },
  {
    id: 'token-verification-reason',
    title: 'Why the token is or is not the project’s',
    meaning: 'The reason the token check was written with.',
    codes: TOKEN_VERIFICATION_REASONS,
    notKnown: ['not_checked'],
    words: (code) => TOKEN_REASON_SENTENCES[code as (typeof TOKEN_VERIFICATION_REASONS)[number]] ?? '',
    fields: ['TokenVerification.reason'],
  },
  {
    id: 'ship-verification',
    title: 'What stands behind a ship',
    meaning: 'How a ship is backed; self-reported and source-backed are different states.',
    codes: keysOf(SHIP_VERIFICATION_WORDS),
    notKnown: [],
    words: (code) => SHIP_VERIFICATION_WORDS[code as keyof typeof SHIP_VERIFICATION_WORDS] ?? '',
    fields: ['Ship.verification'],
  },
  {
    id: 'discovery-gap-withheld',
    title: 'Why the Discovery Gap is not measured',
    meaning: 'Why HEY withholds a project’s Discovery Gap and Under the Radar: not measured, never zero.',
    codes: DISCOVERY_GAP_WITHHELD_REASONS,
    notKnown: DISCOVERY_GAP_WITHHELD_REASONS,
    words: (code) => DISCOVERY_GAP_WITHHELD_WORDS[code as (typeof DISCOVERY_GAP_WITHHELD_REASONS)[number]] ?? '',
    fields: [],
  },
  {
    id: 'still-building-withheld',
    title: 'Why Still Building is not measured',
    meaning: 'Why HEY does not measure Still Building for a project: not measured, never “not held”.',
    codes: STILL_BUILDING_WITHHELD_REASONS,
    notKnown: STILL_BUILDING_WITHHELD_REASONS,
    words: (code) => STILL_BUILDING_WITHHELD_WORDS[code as (typeof STILL_BUILDING_WITHHELD_REASONS)[number]] ?? '',
    fields: [],
  },
  {
    id: 'official-x-link-held',
    title: 'Why an official X link is held',
    meaning: 'Why HEY prints no live link to a project’s X account: a dated fact, never a judgement about the account.',
    codes: OFFICIAL_X_LINK_HOLDS,
    notKnown: [],
    words: (code) => OFFICIAL_X_LINK_HOLD_WORDS[code as (typeof OFFICIAL_X_LINK_HOLDS)[number]]?.machine('handle', '') ?? '',
    fields: ['OfficialX.linkHeld'],
  },
];

/** One vocabulary by id. */
export const stateVocabulary = (id: string): StateVocabulary | undefined => STATE_VOCABULARIES.find((entry) => entry.id === id);

/** The known values of every documented public field, keyed `Schema.field`: what the OpenAPI document names. */
export function knownValuesByField(): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();
  for (const entry of STATE_VOCABULARIES) for (const field of entry.fields) out.set(field, entry.codes);
  return out;
}
