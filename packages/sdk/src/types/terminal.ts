/**
 * The holder routes (2026-11-27, Terminal holder value wave 3 lane K): `/api/terminal/*`, the Research Terminal's own
 * tools read with a HEY account's API key — deep research, saved screener views, the screener, contract control and
 * the catalyst calendar. A key whose account the Terminal does not let in is refused with 403 `forbidden`,
 * `reason: 'not_terminal_account'` and `terminalAccess` naming the gate's state; never an empty answer.
 *
 * Copies of the serializer types in `apps/web/src/lib/terminal-api-views.ts` (`ApiTerminal*`), held identical by
 * `public-api-contract.terminal.test.ts`. No field here is a valuation, price, liquidity, volume or an account.
 */

export type HeyTerminalShown = { shown: number; total: number };

export type HeyTerminalEvidence = { id: string; label: string; url: string };

export type HeyTerminalDeepResearchAllowance = { dailyQuota: number; remaining: number; repeated: boolean; resetsAt: string; sharedWith: string };

export type HeyTerminalDeepResearchLine = {
  tag: 'FACT' | 'DERIVED' | 'UNKNOWN';
  text: string;
  project: { slug: string; name: string } | null;
  at: string | null;
  evidence: HeyTerminalEvidence[];
};

export type HeyTerminalDeepResearchStep = {
  key: string;
  title: string;
  question: string;
  understood: string;
  lead: string | null;
  lines: HeyTerminalDeepResearchLine[];
  held: number;
  notes: string[];
  shown: HeyTerminalShown;
};

export type HeyTerminalDeepResearch =
  | {
      status: 'answered';
      question: string;
      scope: { kind: 'project'; project: { slug: string; name: string } } | { kind: 'following' | 'chain' };
      steps: HeyTerminalDeepResearchStep[];
      receipts: string[];
      aiUsed: false;
      method: string;
      allowance: HeyTerminalDeepResearchAllowance;
    }
  | { status: 'declined'; question: string; reason: string; candidates: { slug: string; name: string }[] };

export type HeyTerminalScreenerQuery = {
  cols: string[];
  status?: string;
  narrative?: string;
  verified?: true;
  chain?: true;
  token?: 'named';
  shipped?: number;
  badge?: string;
  market?: string;
  minLiquidity?: number;
  minVolume?: number;
  sort?: string;
};

export type HeyTerminalSavedViewNews = { state: 'COUNTED'; count: number; since: string } | { state: 'NOT_TRACKED'; reason: 'never_opened' | 'too_many_matches' };

export type HeyTerminalSavedView = {
  id: string;
  name: string;
  search: string;
  query: HeyTerminalScreenerQuery;
  terminalUrl: string;
  lastSeenAt: string | null;
  createdAt: string;
  news: HeyTerminalSavedViewNews;
};

export type HeyTerminalSavedViews = HeyTerminalShown & { views: HeyTerminalSavedView[]; limit: number; note: string };

export type HeyTerminalDevelopment = {
  velocityState: string;
  velocityCurrent: number | null;
  velocityPrevious: number | null;
  cadenceState: string;
  cadenceMedianIntervalDays: number | null;
  consistencyActiveWeeks: number | null;
  consistencyWindowWeeks: number;
  currentStreakWeeks: number | null;
};

export type HeyTerminalScreenerRow = {
  slug: string;
  name: string;
  url: string;
  narrative: { slug: string; name: string } | null;
  activityStatus: string;
  lastMeaningfulShipAt: string | null;
  ships30d: number | null;
  ships30dWithheld: 'activity_not_measured' | null;
  buildMomentum: number | null;
  buildMomentumWithheld: string | null;
  discoveryGap: number | null;
  discoveryGapWithheld: string | null;
  verifiedBuilder: boolean;
  chainEvidence: boolean | null;
  token: { chainId: number; contractAddress: string; verification: string | null; verificationReason: string | null } | null;
  /** Only when a chosen column reads the project's events (velocity, cadence, consistency). */
  development: HeyTerminalDevelopment | null;
};

export type HeyTerminalScreener = HeyTerminalShown & {
  query: HeyTerminalScreenerQuery;
  savedView: { id: string; name: string } | null;
  columns: { key: string; label: string; definition: string }[];
  rows: HeyTerminalScreenerRow[];
  offset: number;
  limit: number;
  nextOffset: number | null;
  order: { sort: string; label: string; hint: string };
  marketFields: string;
};

export type HeyTerminalControlHolder = { kind: string; contract: string | null; words: string; since: string; evidenceId: string; fromDeployment: boolean };

export type HeyTerminalContractControl = {
  slug: string;
  contracts: {
    address: string;
    role: 'token' | 'declared';
    proxyKind: string | null;
    state: 'read' | 'not_read';
    readThrough: string | null;
    owner: HeyTerminalControlHolder | null;
    ownerProposed: HeyTerminalControlHolder | null;
    admin: HeyTerminalControlHolder | null;
  }[];
  pending: {
    id: string;
    timelock: string;
    label: string;
    summary: string;
    scheduledAt: string;
    executableAt: string | null;
    executable: boolean;
    upgrade: boolean;
    call: string | null;
    txUrl: string | null;
    evidenceUrl: string;
  }[];
  recent: {
    id: string;
    kind: string;
    address: string;
    label: string;
    summary: string;
    occurredAt: string | null;
    detectedAt: string;
    txUrl: string | null;
    upgrade: boolean;
    executableAt: string | null;
    evidenceUrl: string;
  }[];
  recentShown: number;
  recentLimit: number;
  /** Null when fewer than `recentLimit` came back (the whole record); else how to read further. */
  recentMore: string | null;
  notRead: number;
  readThrough: string | null;
  note: string;
};

/** A HoodLock unlock ahead. The holder routes carry no Stock Token entry: those stay on the Terminal's calendar page. */
export type HeyTerminalCatalyst = {
  id: string;
  kind: 'unlock';
  kindWords: string;
  basis: 'read_on_chain';
  basisWords: string;
  source: string;
  title: string;
  detail: string;
  at: string;
  project: { slug: string; name: string; symbol: string | null };
  lockId: number;
  receipt: { id: string | null; url: string; label: string };
};

export type HeyTerminalCatalysts = {
  view: 'chain' | 'following' | 'board';
  board: { id: string; name: string } | null;
  projectCount: number | null;
  windowDays: number;
  readAt: string;
  items: HeyTerminalCatalyst[];
  unlocksShown: number;
  unlocksTotal: number;
  unlocksMore: string | null;
  stockTokens: { included: false; note: string };
  notRead: { kind: string; line: string }[];
  order: string;
};

/** `GET /api/terminal/screener`: a saved view by id, or a screen by the screener's own parameters; `offset` pages on. */
export type HeyTerminalScreenerParams = {
  view?: string;
  status?: string;
  narrative?: string;
  verified?: boolean;
  chain?: boolean;
  token?: 'named';
  shipped?: 7 | 30 | 90;
  badge?: 'still-building' | 'under-the-radar';
  market?: 'live' | 'trading';
  minLiquidity?: number;
  minVolume?: number;
  sort?: 'shipped30d' | 'newest';
  cols?: readonly string[];
  offset?: number;
};

/** `GET /api/terminal/catalysts`: the chain, what the account follows, or one of its boards; 30, 90 or 365 days. */
export type HeyTerminalCatalystsParams = { view?: 'chain' | 'following' | 'board'; board?: string; days?: 30 | 90 | 365 };
