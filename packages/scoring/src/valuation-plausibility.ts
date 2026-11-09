/**
 * Whether a valuation is plausible from the readings HEY holds (founder
 * decision, round 4, 2026-09-30): the one gate, with its thresholds.
 *
 * A valuation — a market cap or an FDV — is **not plausible** when
 *
 *  1. it is at least `maxLiquidityMultiple` (10,000×) the liquidity measured
 *     in the same reading (`valuation_over_liquidity`); or
 *  2. it exceeds `unlistedCeilingUsd` ($10B) on a Robinhood Chain token that
 *     no listing HEY reads carries (`unlisted_over_ceiling`); or
 *  3. HEY's own chain evidence contradicts the reading more than
 *     `VALUATION_CHAIN_EVIDENCE.contradictionMultiple` (10×) (`chain_evidence_contradicts`,
 *     2026-10-09 audit E2/E3): the price of the token's decoded on-chain
 *     trades (`token_market_days.trade_close_usd`, the last
 *     `maxAgeDays` before the reading) is more than 10× away
 *     from the reading's price, or HEY's chain pool index holds less than a
 *     tenth of the reading's liquidity on a day the reading itself traded
 *     under `indexMaxTurnover` of it. USDB ($10.4B on GeckoTerminal,
 *     $82M "liquidity", $10.69 of volume) led Explore's valuation order while
 *     its decoded trades priced it 80× lower and the index held $2.8M. The
 *     index under-reads real markets (a Uniswap v4 pool it does not index), so
 *     it never decides alone: a reading that really trades — openzaps, $125K a
 *     day on a $194K pool the index holds $2 of — is not caught. Rule 3
 *     needs the caller's chain evidence and is not yet a scorer input
 *     (`VALUATION_CHAIN_EVIDENCE`); or
 *  4. another source's price for the same token, its newest reading within
 *     a day of this one, is more than `VALUATION_SOURCES_DISAGREE.maxPriceRatio`
 *     (10×) away from the reading's (`sources_disagree`, 2026-10-09 red-team
 *     F1). USDB's chosen reading — decoded on-chain trades at $0.018, so its
 *     own trade close agreed and rule 3 stayed silent — valued it at $182M
 *     and held #2 on Explore's valuation order while CoinGecko and
 *     GeckoTerminal priced it near $1 the same day. Below 10× the figure
 *     stays and is labelled "sources disagree" (`marketSourcesDisagree`, 2×);
 *     at 10× HEY cannot say which figure is the market, so it publishes
 *     neither as the valuation. Like rule 3 it needs the caller's other-source
 *     readings and is not a scorer input; or
 *  5. it is at least `VALUATION_QUOTE_SIDE.maxQuoteSideMultiple` (10,000×) the
 *     market's **quote side** — the side of its pools that is not the token
 *     (ETH, WETH, USDG, a stablecoin, any other asset), summed over the
 *     token's pools in HEY's chain pool index on the reading's UTC day or the
 *     day before (`quote_side_thin`, founder ruling 2026-11-09, "ni kau kena
 *     fix"; data-trust audit P2-3). Rule 1 compares with both sides of a
 *     pool, so a pool that is almost all the token's own supply valued at its
 *     own price passes it: `blorb` printed $94M on $9.4M of "liquidity" whose
 *     other side HEY's index put at $376 to $2,404. Two-sided liquidity is not
 *     what a market can pay out; the quote side is. Like rules 3 and 4 it needs
 *     the caller's chain evidence (`chainIndexQuoteSide`); the scorer passes it
 *     since hbm-v35.
 *
 * An implausible valuation is never labelled FACT and never used as an input
 * anywhere a valuation is used: the card, the project page, the Terminal,
 * search, the API, the snapshot, the agent contract, the explain engine, the
 * listing sorts and filters, the Discovery Gap's market percentile, Still
 * Building's drawdown and Under the Radar. It is printed as "valuation not
 * plausible from the readings HEY has", with its reason. The reading's
 * price, liquidity and volume are untouched: this gate objects to the
 * valuation alone.
 *
 * What is checked is the reading's *largest* valuation — its FDV when it
 * carries one, otherwise its market cap — and the verdict holds for both
 * figures of that reading: a reading whose FDV is not plausible does not get
 * to print its market cap as though the rest of it were sound.
 *
 * Unknown is never a trip wire. With no positive liquidity reading rule 1 is
 * silent (a missing figure is not a zero); with no index day, a day keyed by
 * the v4 PoolManager, or an index that holds under a tenth of the reading's
 * liquidity (it is not reading the market the reading describes) rule 5 is
 * silent; and with the listing unknown —
 * HEY holds no CoinGecko quote for the token and no registry read to check
 * it against — rule 2 is silent. HEY reads CoinGecko (its registry of
 * Robinhood Chain coins, daily, and its quotes); it reads no CoinMarketCap
 * source, so a token listed only there is not seen as listed.
 *
 * Pure and dependency-free, like `valuationKindOf`, so `@hey/ui` can import
 * it. The SQL twin is `valuationImplausibleSql` in `@hey/domain`, generated
 * from the same constants; an integration test holds the two together.
 */
export const VALUATION_PLAUSIBILITY = {
  /** At or above this multiple of the same reading's liquidity, a valuation is not plausible. */
  maxLiquidityMultiple: 10_000,
  /** Above this, a Robinhood Chain token needs a listing HEY reads for its valuation to be plausible. */
  unlistedCeilingUsd: 10_000_000_000,
  /** The chain rule 2 is about: Robinhood Chain (`ROBINHOOD_CHAIN_ID` in `@hey/config`; a test holds the two). */
  chainId: 4663,
} as const;

/**
 * Rule 3's thresholds (2026-10-09 audit E2/E3), kept apart from
 * `VALUATION_PLAUSIBILITY` on purpose: rule 3 fires only when a caller passes
 * HEY's chain evidence, and the scorer does not yet (the Discovery Gap and
 * Still Building read rules 1 and 2 only). Wiring it into the scorer changes
 * the scoring rule set and needs its own version (hbm-v26) and a ruling; the
 * card, its sorts and filters, the profile, the market detail, the API and
 * the explain engine apply it now. Withhold only, never awards.
 */
export const VALUATION_CHAIN_EVIDENCE = {
  /** HEY's own chain evidence more than this many times away from the reading contradicts it. */
  contradictionMultiple: 10,
  /** … read in the days up to this many before the reading (the market-status sweep's trade-close window). */
  maxAgeDays: 2,
  /** … and the index decides only beside a reading that traded at most this share of its own liquidity in the day. */
  indexMaxTurnover: 0.001,
} as const;

/**
 * Rule 4's thresholds (2026-10-09 red-team F1). Apart from the others for
 * rule 3's reason: it fires only when a caller passes the other sources'
 * prices, and the scorer does not. Withhold only, never awards.
 */
export const VALUATION_SOURCES_DISAGREE = {
  /** Another source's price more than this many times away from the reading's withholds its valuation. */
  maxPriceRatio: 10,
  /** … each other source's newest reading within this long of the reading (`MARKET_SOURCES_DISAGREE.windowMs`). */
  windowMs: 24 * 60 * 60 * 1000,
} as const;

/**
 * Rule 5's thresholds (founder ruling 2026-11-09, "ni kau kena fix"; data-trust
 * audit P2-3). A scorer input since hbm-v35: a valuation this rule withholds
 * leaves the Discovery Gap's percentile and is no current value for Still
 * Building, as every other rule's. Withhold only, never awards.
 */
export const VALUATION_QUOTE_SIDE = {
  /** At or above this multiple of the market's quote side, a valuation is not plausible. */
  maxQuoteSideMultiple: 10_000,
  /** The index day read: the reading's UTC day, or up to this many days before (the index is refreshed every six hours). */
  maxAgeDays: 1,
  /**
   * The index decides only when it holds at least this share of the reading's own liquidity: below it the index is
   * not reading the market the reading describes (a pool it does not index — openzaps, $2 of a $194K pool), and the
   * quote side is unknown, never thin.
   */
  minIndexCoverage: 0.1,
} as const;

/** The rules' version, carried by the explain engine's valuation rule. */
export const VALUATION_PLAUSIBILITY_VERSION = 'valuation-plausibility-2026-11-09' as const;

export const VALUATION_IMPLAUSIBLE_REASONS = [
  'valuation_over_liquidity',
  'unlisted_over_ceiling',
  'chain_evidence_contradicts',
  'sources_disagree',
  'quote_side_thin',
] as const;
export type ValuationImplausibleReason = (typeof VALUATION_IMPLAUSIBLE_REASONS)[number];

/** Whether a listing HEY reads carries the token: `unknown` when HEY cannot say. */
export type ValuationListing = 'listed' | 'not_listed' | 'unknown';

export type ValuationPlausibilityInput = {
  /** The reading's market cap. */
  marketCapUsd?: number | null | undefined;
  /** The reading's FDV. */
  fdvUsd?: number | null | undefined;
  /** The same reading's liquidity; absent or non-positive means not measured. */
  liquidityUsd?: number | null | undefined;
  /** The token's chain. */
  chainId?: number | null | undefined;
  /** Whether a listing HEY reads carries the token; omitted is `unknown`. */
  listing?: ValuationListing | null | undefined;
  /** The reading's price (rule 3). */
  priceUsd?: number | null | undefined;
  /** The reading's 24 h volume (rule 3); absent means the provider did not report it. */
  volume24hUsd?: number | null | undefined;
  /** HEY's own decoded on-chain trade close for the token near the reading (rule 3); absent when HEY has none. */
  chainTradePriceUsd?: number | null | undefined;
  /** HEY's chain pool index liquidity for the token near the reading (rule 3); absent when HEY has none. */
  chainIndexLiquidityUsd?: number | null | undefined;
  /** Each other source's newest price within a day of the reading (rule 4); absent or empty when HEY holds none. */
  otherSourcePricesUsd?: readonly (number | null | undefined)[] | null | undefined;
  /** HEY's chain pool index on the reading's day (rule 5, 2026-11-09); absent when HEY holds no such day. */
  chainIndexQuoteSide?: ChainIndexQuoteSide | null | undefined;
};

/**
 * One day of HEY's chain pool index, as rule 5 reads it: the side of the token's pools that is not the token, and
 * every pool's liquidity added (both sides) on the same day. Either absent is unknown.
 */
export type ChainIndexQuoteSide = {
  quoteSideUsd?: number | null | undefined;
  liquidityUsd?: number | null | undefined;
};

export type ValuationPlausibility =
  { plausible: true } | { plausible: false; reason: ValuationImplausibleReason };

const positive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** The figure the gate checks: the reading's largest positive valuation, or undefined when it carries none. */
export function valuationUnderTest(
  input: Pick<ValuationPlausibilityInput, 'marketCapUsd' | 'fdvUsd'>,
): number | undefined {
  const values = [input.marketCapUsd, input.fdvUsd].filter(positive);
  return values.length === 0 ? undefined : Math.max(...values);
}

export function valuationPlausibility(input: ValuationPlausibilityInput): ValuationPlausibility {
  const value = valuationUnderTest(input);
  if (value === undefined) return { plausible: true };
  if (
    positive(input.liquidityUsd) &&
    value >= input.liquidityUsd * VALUATION_PLAUSIBILITY.maxLiquidityMultiple
  ) {
    return { plausible: false, reason: 'valuation_over_liquidity' };
  }
  if (quoteSideThin(input)) return { plausible: false, reason: 'quote_side_thin' };
  if (chainEvidenceContradicts(input)) return { plausible: false, reason: 'chain_evidence_contradicts' };
  if (otherSourcesDisagree(input)) return { plausible: false, reason: 'sources_disagree' };
  if (
    input.chainId === VALUATION_PLAUSIBILITY.chainId &&
    value > VALUATION_PLAUSIBILITY.unlistedCeilingUsd &&
    input.listing === 'not_listed'
  ) {
    return { plausible: false, reason: 'unlisted_over_ceiling' };
  }
  return { plausible: true };
}

/**
 * Rule 3 (2026-10-09): HEY's own chain evidence contradicts the reading.
 * Unknown is never a trip wire: a missing price, trade close, index reading
 * or volume leaves its half silent.
 */
export function chainEvidenceContradicts(
  input: Pick<
    ValuationPlausibilityInput,
    'priceUsd' | 'liquidityUsd' | 'volume24hUsd' | 'chainTradePriceUsd' | 'chainIndexLiquidityUsd'
  >,
): boolean {
  const multiple = VALUATION_CHAIN_EVIDENCE.contradictionMultiple;
  if (positive(input.priceUsd) && positive(input.chainTradePriceUsd)) {
    const ratio = Math.max(
      input.priceUsd / input.chainTradePriceUsd,
      input.chainTradePriceUsd / input.priceUsd,
    );
    if (ratio > multiple) return true;
  }
  return (
    positive(input.liquidityUsd) &&
    positive(input.chainIndexLiquidityUsd) &&
    input.liquidityUsd > input.chainIndexLiquidityUsd * multiple &&
    typeof input.volume24hUsd === 'number' &&
    Number.isFinite(input.volume24hUsd) &&
    input.volume24hUsd >= 0 &&
    input.volume24hUsd <= input.liquidityUsd * VALUATION_CHAIN_EVIDENCE.indexMaxTurnover
  );
}

/**
 * Rule 4 (2026-10-09 red-team F1): another source's price is more than 10×
 * away from the reading's. Unknown is never a trip wire: a missing price on
 * either side decides nothing.
 */
export function otherSourcesDisagree(
  input: Pick<ValuationPlausibilityInput, 'priceUsd' | 'otherSourcePricesUsd'>,
): boolean {
  if (!positive(input.priceUsd)) return false;
  const price = input.priceUsd;
  return (input.otherSourcePricesUsd ?? []).some(
    (other) => positive(other) && Math.max(price / other, other / price) > VALUATION_SOURCES_DISAGREE.maxPriceRatio,
  );
}

/**
 * Rule 5 (founder ruling 2026-11-09): the valuation is at least 10,000× the market's quote side in HEY's chain pool
 * index. Unknown is never a trip wire: no valuation, no positive quote side or index liquidity, no positive liquidity
 * on the reading, or an index holding under `minIndexCoverage` of the reading's liquidity decides nothing.
 */
export function quoteSideThin(
  input: Pick<ValuationPlausibilityInput, 'marketCapUsd' | 'fdvUsd' | 'liquidityUsd' | 'chainIndexQuoteSide'>,
): boolean {
  const value = valuationUnderTest(input);
  const index = input.chainIndexQuoteSide;
  if (value === undefined || !index) return false;
  const { quoteSideUsd, liquidityUsd: indexLiquidityUsd } = index;
  if (!positive(quoteSideUsd) || !positive(indexLiquidityUsd) || !positive(input.liquidityUsd)) return false;
  if (indexLiquidityUsd < input.liquidityUsd * VALUATION_QUOTE_SIDE.minIndexCoverage) return false;
  return value >= quoteSideUsd * VALUATION_QUOTE_SIDE.maxQuoteSideMultiple;
}

/**
 * One pool row of an index day, as `chainIndexQuoteSideOf` reads it (`token_pool_venue_days`): `aggregate` is the
 * `other` row that sums the pools past the ten largest, `notIndexed` the v4 PoolManager's marker.
 */
export type ChainIndexQuoteSideVenue = {
  liquidityUsd?: number | null | undefined;
  quoteSideUsd?: number | null | undefined;
  aggregate?: boolean;
  notIndexed?: boolean;
};

/**
 * The quote side of one index day (2026-11-09), the TS twin of `chainIndexQuoteSideSql` in `@hey/domain`. Every
 * pool counts, one-sided pools included — their quote side is the only quote money they hold, and leaving them out
 * would leave a wholly one-sided market unmeasured. What HEY cannot read counts at its most generous, so an unknown
 * never makes a market thin: a pool whose quote side is unpriced, and the `other` row (whose sum may hide unpriced
 * pools), count their whole liquidity; liquidity in the day's sum that no pool row names (a pool the provider named
 * no contract for) counts whole too. Undefined — unknown, never 0 — with no pool rows, a PoolManager-keyed day, or
 * no positive day liquidity.
 */
export function chainIndexQuoteSideOf(day: {
  liquidityUsd?: number | null | undefined;
  venues: readonly ChainIndexQuoteSideVenue[];
}): number | undefined {
  if (!positive(day.liquidityUsd) || day.venues.length === 0) return undefined;
  if (day.venues.some((venue) => venue.notIndexed)) return undefined;
  const finite = (value: number | null | undefined): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  let quote = 0;
  let named = 0;
  for (const venue of day.venues) {
    const liquidity = finite(venue.liquidityUsd);
    const side = finite(venue.quoteSideUsd);
    named += liquidity ?? 0;
    quote += venue.aggregate || side === undefined ? (liquidity ?? 0) : Math.min(side, liquidity ?? side);
  }
  return quote + Math.max(day.liquidityUsd - named, 0);
}

/** A stored or transported reason read back: one of the list, or undefined for anything else. */
export function valuationImplausibleReason(value: unknown): ValuationImplausibleReason | undefined {
  return typeof value === 'string' &&
    (VALUATION_IMPLAUSIBLE_REASONS as readonly string[]).includes(value)
    ? (value as ValuationImplausibleReason)
    : undefined;
}

/** The one phrase every surface prints where an implausible valuation would be. */
export const VALUATION_NOT_PLAUSIBLE_WORDS =
  'Valuation not plausible from the readings HEY has' as const;

/** Each reason in words, after the phrase above. */
export const VALUATION_IMPLAUSIBLE_WORDS: Readonly<Record<ValuationImplausibleReason, string>> = {
  valuation_over_liquidity: `it is at least ${VALUATION_PLAUSIBILITY.maxLiquidityMultiple.toLocaleString('en-US')}× the liquidity measured in the same reading`,
  unlisted_over_ceiling: `it is above $${VALUATION_PLAUSIBILITY.unlistedCeilingUsd / 1_000_000_000}B on a Robinhood Chain token that no listing HEY reads carries (HEY reads CoinGecko)`,
  chain_evidence_contradicts: `HEY's own chain readings contradict it more than ${VALUATION_CHAIN_EVIDENCE.contradictionMultiple}×: the price of the token's decoded on-chain trades, or the liquidity in HEY's chain pool index on a day the reading barely traded`,
  sources_disagree: `another source priced the token more than ${VALUATION_SOURCES_DISAGREE.maxPriceRatio}× away from this reading within a day, so HEY cannot say which figure is the market`,
  quote_side_thin: `it is at least ${VALUATION_QUOTE_SIDE.maxQuoteSideMultiple.toLocaleString('en-US')}× the side of the token's pools that is not the token itself (ETH, stablecoins or any other asset) in HEY's chain pool index: the pools' liquidity is almost all the token's own supply`,
};

/** "Valuation not plausible from the readings HEY has: <reason>." — one sentence, for tooltips, the API and agents. */
export function valuationNotPlausibleSentence(reason: ValuationImplausibleReason): string {
  return `${VALUATION_NOT_PLAUSIBLE_WORDS}: ${VALUATION_IMPLAUSIBLE_WORDS[reason]}. Context only; it never affects activity status or any score.`;
}
