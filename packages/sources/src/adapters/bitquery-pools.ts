import { z } from 'zod';

import { type SourceAdapter, type SourceContext, type SourceResult } from '../adapter';
import { performSourceFetch } from '../http/perform';
import { dexPoolFactoryById } from '../factories/dex-pools';
import { toNumber } from '../market';
import { BITQUERY_BATCH_SIZE, BITQUERY_DEFAULT_BASE_URL, BITQUERY_NETWORK, BITQUERY_POINTS, bitqueryAnswerError, withBitqueryPoints } from './bitquery';

/**
 * A token's pools, and how much of it can actually be sold (2026-09-15).
 *
 * HEY's liquidity figure came from an aggregator, which reports the deepest
 * pool and calls it the token's. On PONS that read $5.87M against $24.53M
 * across its pools, and the endpoint lists thirty pools at most where the
 * chain has fifty-six. This reads the pools themselves.
 *
 * The second cube is the one worth having. `DEXPoolSlippages` publishes, per
 * pool, how much can be traded before the price moves by a fixed amount —
 * `MaxAmountIn` at 100 basis points is what can be sold for a one per cent
 * move. A reader can act on that. Nobody has ever been able to act on
 * "liquidity $5.9M", and on this chain that number was usually a single pool's
 * anyway.
 *
 * **A token is not always CurrencyA.** $HEY is CurrencyB in its only pool, so
 * a one-sided filter finds nothing for it at all — which is why both cubes
 * match on either side with `any:` and the normaliser works out which side the
 * token sits on before reading a depth from it.
 *
 * Counts, prices and pool reserves. No address beyond the pool contracts
 * themselves, which are markets rather than holders.
 *
 * **A Uniswap v4 pool is its PoolId, not its contract** (2026-11-09, data-trust
 * audit P1-2). Every v4 pool lives inside the one PoolManager, so keyed by
 * `SmartContract` all of a token's v4 pools were one "pool" — the first row
 * kept, the rest dropped, whatever their depth (ryft: $27 in the index beside
 * $875K). Both cubes now ask for `PoolId` and a PoolManager row is keyed by
 * it; a PoolManager row that comes back without a 32-byte id is a pool the
 * index does not hold — the token's figures are then unknown, never a sum of
 * the pools it happened to keep. And a pool whose quote side is under
 * `ONE_SIDED_QUOTE_SHARE` of it is the token's own inventory valued at its own
 * price (chinapad: $247K with $1 on the other side): it is no liquidity and no
 * depth. It leaves the token's depth here; it stays in the sum and among the
 * venues, with its quote side, so the readers of the index leave it out of the
 * liquidity they measure against (`poolDayTradableLiquiditySql` in `@hey/domain`)
 * the same way on a day written before this rule and on one written after.
 */
/** The one Uniswap v4 PoolManager on Robinhood Chain: a row here names its pool by `PoolId`. */
export const V4_POOL_MANAGER = (() => {
  const manager = dexPoolFactoryById('UNISWAP_V4_POOLS');
  if (!manager) throw new Error('bitquery-pools: the v4 PoolManager must be registered');
  return manager.factoryAddress.toLowerCase();
})();
/** A pool whose side that is not the token holds less than this share of it is one-sided (2026-11-09). */
export const ONE_SIDED_QUOTE_SHARE = 0.01;
const POOL_ID = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CACHE_TTL_SECONDS = 30 * 60;

/** One per cent. The level a reader understands without being told what a basis point is. */
export const DEPTH_BASIS_POINTS = 100;

/*
 * Realtime only, and not a parameter: `DEXPoolEvents` and `DEXPoolSlippages`
 * are outside the historical add-on's grant, so this document can never read
 * the archive (see `BITQUERY_ARCHIVE_CUBES`).
 */
export const BITQUERY_POOLS_QUERY = `query HeyTokenPools($addresses: [String!], $since: DateTime) {
  EVM(network: ${BITQUERY_NETWORK}, dataset: realtime) {
    pools: DEXPoolEvents(
      where: {
        Block: { Time: { since: $since } }
        any: [
          { PoolEvent: { Pool: { CurrencyA: { SmartContract: { in: $addresses } } } } }
          { PoolEvent: { Pool: { CurrencyB: { SmartContract: { in: $addresses } } } } }
        ]
      }
      limit: { count: 5000 }
    ) {
      PoolEvent {
        Pool {
          SmartContract
          PoolId
          CurrencyA { SmartContract }
          CurrencyB { SmartContract }
        }
        Liquidity {
          a: AmountCurrencyAInUSD(maximum: Block_Number)
          b: AmountCurrencyBInUSD(maximum: Block_Number)
        }
      }
      events: count
    }
    depth: DEXPoolSlippages(
      where: {
        Block: { Time: { since: $since } }
        Price: { SlippageBasisPoints: { eq: ${DEPTH_BASIS_POINTS} } }
        any: [
          { Price: { Pool: { CurrencyA: { SmartContract: { in: $addresses } } } } }
          { Price: { Pool: { CurrencyB: { SmartContract: { in: $addresses } } } } }
        ]
      }
      limit: { count: 5000 }
    ) {
      Price {
        Pool {
          SmartContract
          PoolId
          CurrencyA { SmartContract }
          CurrencyB { SmartContract }
        }
        AtoB { sellingA: MaxAmountIn(maximum: Block_Number) }
        BtoA { sellingB: MaxAmountIn(maximum: Block_Number) }
      }
    }
  }
}`;

const numberish = z.union([z.number(), z.string()]).nullish();
const poolSchema = z.object({
  SmartContract: z.string().nullish(),
  /** A v4 pool's 32-byte id (2026-11-09); other venues may leave it empty. */
  PoolId: z.string().nullish(),
  CurrencyA: z.object({ SmartContract: z.string().nullish() }).nullish(),
  CurrencyB: z.object({ SmartContract: z.string().nullish() }).nullish(),
});

const poolRowSchema = z.object({
  PoolEvent: z.object({
    Pool: poolSchema,
    Liquidity: z.object({ a: numberish, b: numberish }).nullish(),
  }),
  events: numberish,
});

const depthRowSchema = z.object({
  Price: z.object({
    Pool: poolSchema,
    AtoB: z.object({ sellingA: numberish }).nullish(),
    BtoA: z.object({ sellingB: numberish }).nullish(),
  }),
});

const responseSchema = z.object({
  data: z
    .object({
      EVM: z.object({ pools: z.array(poolRowSchema).nullish(), depth: z.array(depthRowSchema).nullish() }).nullish(),
    })
    .nullish(),
  errors: z.array(z.object({ message: z.string() })).nullish(),
});

export type BitqueryPoolsInput = {
  /** Token contracts, at most `BITQUERY_BATCH_SIZE`; the caller chunks. */
  addresses: readonly string[];
  /** Pool state at or after this moment; the newest reading in the window wins. */
  since: Date;
  apiKey: string;
  baseUrl?: string;
};

/** One token's pools as the chain last reported them. */
export type BitqueryTokenPools = {
  tokenAddress: string;
  /** How many distinct pools the token has state in. */
  pools: number;
  /**
   * Both sides of every pool, in USD — the token's whole market, not its
   * deepest pool. One-sided pools are in it, as they always were, and named
   * among the venues with their quote side: what reads the index leaves them
   * out where it must (`poolDayTradableLiquiditySql` in `@hey/domain`), so a
   * day written before 2026-11-09 and one written after read the same way.
   */
  liquidityUsd?: number;
  /**
   * How much of the token can be sold before the price moves one per cent,
   * in whole tokens, added up across its pools. The caller prices it. A
   * one-sided pool's depth is not in it (2026-11-09): selling into the
   * token's own inventory is no depth.
   */
  depthOnePctBase?: number;
  /** Pool events seen in the window; a pool with none is quiet, not absent. */
  events: number;
  /**
   * Each pool on its own (2026-09-26), from the same rows the sum above is
   * made of, so the parts add up to the whole. `liquidityUsd` is both sides,
   * `quoteSideUsd` the side that is not this token; either is absent when the
   * provider did not price it, and 0 only when it priced every side at
   * nothing. Largest first. A v4 pool is keyed by its 32-byte PoolId.
   *
   * A venue marked `notIndexed` is the PoolManager when it answered rows with
   * no PoolId: the index does not hold those pools, and it carries no figure.
   */
  venues?: BitqueryPoolVenue[];
  /**
   * The PoolManager answered rows with no PoolId (2026-11-09): the index does
   * not hold every pool of this token, so `liquidityUsd` and `depthOnePctBase`
   * are absent — unknown, never the sum of the pools it kept.
   */
  poolsNotIndexed?: true;
};

export type BitqueryPoolVenue = { pool: string; liquidityUsd?: number; quoteSideUsd?: number; notIndexed?: true };

const money = (value: number | string | null | undefined): number | undefined => {
  const parsed = toNumber(value);
  return parsed !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/** Which side of the pool the token sits on, or nothing if it is neither. */
const sideOf = (pool: z.infer<typeof poolSchema>, wanted: ReadonlySet<string>): 'a' | 'b' | undefined => {
  const a = pool.CurrencyA?.SmartContract?.toLowerCase();
  const b = pool.CurrencyB?.SmartContract?.toLowerCase();
  if (a && wanted.has(a)) return 'a';
  if (b && wanted.has(b)) return 'b';
  return undefined;
};
const tokenOf = (pool: z.infer<typeof poolSchema>, side: 'a' | 'b'): string | undefined =>
  (side === 'a' ? pool.CurrencyA?.SmartContract : pool.CurrencyB?.SmartContract)?.toLowerCase();

/**
 * The pool a row describes (2026-11-09): the PoolId for a row of the v4
 * PoolManager, the contract otherwise. `null` is a PoolManager row with no
 * 32-byte id — a pool the index cannot tell apart from the token's other v4
 * pools; `undefined` a row that names no pool at all.
 */
export function poolKeyOf(pool: { SmartContract?: string | null; PoolId?: string | null }): string | null | undefined {
  const contract = pool.SmartContract?.toLowerCase();
  if (contract !== V4_POOL_MANAGER) return contract || undefined;
  const id = pool.PoolId?.toLowerCase();
  return id && POOL_ID.test(id) ? id : null;
}

/** Whether a priced pool is one-sided: its quote side measured, and under `ONE_SIDED_QUOTE_SHARE` of the pool. */
export function poolIsOneSided(venue: { liquidityUsd?: number; quoteSideUsd?: number; quoteMeasured?: boolean }): boolean {
  if (venue.liquidityUsd === undefined || !(venue.liquidityUsd > 0) || !venue.quoteMeasured) return false;
  return (venue.quoteSideUsd ?? 0) < venue.liquidityUsd * ONE_SIDED_QUOTE_SHARE;
}

type PricedPool = BitqueryPoolVenue & { quoteMeasured?: boolean };

type Working = {
  tokenAddress: string;
  pools: number;
  events: number;
  seen: Set<string>;
  /** Liquidity and depth of rows that name no pool, summed as before: they cannot be once per pool. */
  loose?: number;
  looseDepth?: number;
  depth: Map<string, number>;
  sawEmpty?: boolean;
  notIndexed?: boolean;
  priced: Map<string, PricedPool>;
};

export function normalizeBitqueryPools(
  data: NonNullable<NonNullable<z.infer<typeof responseSchema>['data']>['EVM']>,
  addresses: readonly string[],
): BitqueryTokenPools[] {
  const wanted = new Set(addresses.map((address) => address.toLowerCase()));
  const byToken = new Map<string, Working>();
  const at = (token: string): Working => {
    const current = byToken.get(token) ?? { tokenAddress: token, pools: 0, events: 0, seen: new Set<string>(), depth: new Map<string, number>(), priced: new Map<string, PricedPool>() };
    byToken.set(token, current);
    return current;
  };

  for (const row of data.pools ?? []) {
    const side = sideOf(row.PoolEvent.Pool, wanted);
    if (!side) continue;
    const token = tokenOf(row.PoolEvent.Pool, side);
    if (!token || !ADDRESS.test(token)) continue;
    const entry = at(token);
    entry.events += toNumber(row.events) ?? 0;
    const pool = poolKeyOf(row.PoolEvent.Pool);
    // A PoolManager row with no PoolId is no pool HEY can hold: the token's figures are unknown (2026-11-09).
    if (pool === null) {
      entry.notIndexed = true;
      continue;
    }
    if (pool && !entry.seen.has(pool)) {
      entry.seen.add(pool);
      entry.pools += 1;
    }
    /*
     * A pool's liquidity is both of its sides. The token side alone would
     * halve a balanced pool and mislead on an unbalanced one, and every
     * aggregator quotes the whole pool.
     */
    const total = (money(row.PoolEvent.Liquidity?.a) ?? 0) + (money(row.PoolEvent.Liquidity?.b) ?? 0);
    // A pool the provider priced at nothing is an empty pool, not an unread one (2026-09-25).
    const raw = [row.PoolEvent.Liquidity?.a, row.PoolEvent.Liquidity?.b].filter((value) => value !== undefined && value !== null);
    const allZero = raw.length > 0 && raw.every((value) => Number(value) === 0);
    if (total === 0 && allZero) entry.sawEmpty = true;
    if (!pool) {
      if (total > 0) entry.loose = (entry.loose ?? 0) + total;
      continue;
    }
    /*
     * Once per pool (2026-09-18): the provider returns one row per event and
     * the sum ran over all of them — yolo's one pool read $5,078 against the
     * card's $1. The first priced reading of a pool is the one kept, for the
     * venue and the sum alike (2026-09-26), so the parts add up to the whole.
     */
    const venue = entry.priced.get(pool) ?? { pool };
    if (venue.liquidityUsd === undefined || venue.liquidityUsd === 0) {
      if (total > 0) {
        venue.liquidityUsd = total;
        const quoteRaw = side === 'a' ? row.PoolEvent.Liquidity?.b : row.PoolEvent.Liquidity?.a;
        const quote = money(quoteRaw);
        if (quote !== undefined) venue.quoteSideUsd = quote;
        else delete venue.quoteSideUsd;
        // Priced at 0 is a measured empty side; an unpriced side is unknown and never makes a pool one-sided.
        venue.quoteMeasured = quote !== undefined || (quoteRaw !== undefined && quoteRaw !== null && Number(quoteRaw) === 0);
      } else if (allZero && venue.liquidityUsd === undefined) {
        venue.liquidityUsd = 0;
        venue.quoteSideUsd = 0;
      }
    }
    entry.priced.set(pool, venue);
  }

  for (const row of data.depth ?? []) {
    const side = sideOf(row.Price.Pool, wanted);
    if (!side) continue;
    const token = tokenOf(row.Price.Pool, side);
    if (!token || !ADDRESS.test(token)) continue;
    const pool = poolKeyOf(row.Price.Pool);
    if (pool === null) {
      at(token).notIndexed = true;
      continue;
    }
    // Selling the token means A→B when it is A, and B→A when it is B; taking
    // the wrong direction would quote the depth of the quote asset instead.
    const amount = money(side === 'a' ? row.Price.AtoB?.sellingA : row.Price.BtoA?.sellingB);
    if (amount === undefined) continue;
    const entry = at(token);
    if (!pool) {
      entry.looseDepth = (entry.looseDepth ?? 0) + amount;
      continue;
    }
    // Once per pool, like liquidity (2026-09-18): summed over every returned
    // slippage row, apple-robinhood-token's 1% depth came to 4,900× its supply.
    if (!entry.depth.has(pool)) entry.depth.set(pool, amount);
  }

  return [...byToken.values()]
    .map((entry): BitqueryTokenPools => {
      const all = [...entry.priced.values()];
      const oneSided = new Set(all.filter(poolIsOneSided).map((venue) => venue.pool));
      // A v4 pool id is a 32-byte id rather than a contract; both identify a market.
      const venues: BitqueryPoolVenue[] = all
        .filter((venue) => /^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(venue.pool))
        .map(({ quoteMeasured: _quoteMeasured, ...venue }) => venue)
        .sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1) || a.pool.localeCompare(b.pool));
      const base = { tokenAddress: entry.tokenAddress, pools: entry.pools, events: entry.events };
      if (entry.notIndexed) {
        // The index does not hold every pool of this token: no figure, and the PoolManager named as the pool it misses.
        return { ...base, poolsNotIndexed: true, venues: [...venues, { pool: V4_POOL_MANAGER, notIndexed: true }] };
      }
      const priced = all.filter((venue) => (venue.liquidityUsd ?? 0) > 0);
      const liquidity =
        priced.length > 0 || entry.loose !== undefined
          ? priced.reduce((sum, venue) => sum + (venue.liquidityUsd ?? 0), entry.loose ?? 0)
          : // Every priced reading empty and none with liquidity: the pools hold nothing, so say 0 rather than
            // leave the figure unknown — an unknown kept the pre-drain total in the index all day.
            entry.sawEmpty
            ? 0
            : undefined;
      const depthParts = [...entry.depth.entries()].filter(([pool]) => !oneSided.has(pool)).map(([, amount]) => amount);
      const depth =
        depthParts.length > 0 || entry.looseDepth !== undefined ? depthParts.reduce((sum, amount) => sum + amount, entry.looseDepth ?? 0) : undefined;
      return {
        ...base,
        ...(liquidity === undefined ? {} : { liquidityUsd: liquidity }),
        ...(depth === undefined ? {} : { depthOnePctBase: depth }),
        venues,
      };
    })
    .sort((a, b) => a.tokenAddress.localeCompare(b.tokenAddress));
}

export function createBitqueryPoolsAdapter(): SourceAdapter<BitqueryPoolsInput, BitqueryTokenPools[]> {
  return {
    name: 'bitquery',
    canHandle: (input) =>
      input.addresses.length > 0 &&
      input.addresses.length <= BITQUERY_BATCH_SIZE &&
      input.addresses.every((address) => ADDRESS.test(address)) &&
      input.apiKey.length > 0,
    async fetch(input, ctx: SourceContext): Promise<SourceResult<BitqueryTokenPools[]>> {
      const addresses = [...new Set(input.addresses.map((address) => address.toLowerCase()))];
      return withBitqueryPoints(await performSourceFetch(
        ctx,
        {
          url: input.baseUrl ?? BITQUERY_DEFAULT_BASE_URL,
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` },
          body: JSON.stringify({ query: BITQUERY_POOLS_QUERY, variables: { addresses, since: input.since.toISOString() } }),
          allowedContentTypes: ['application/json'],
        },
        {
          schema: responseSchema,
          parse: (body) => JSON.parse(body),
          cacheTtlSeconds: CACHE_TTL_SECONDS,
          normalize: (response) => {
            if (response.errors?.length) throw bitqueryAnswerError(response.errors);
            return normalizeBitqueryPools(response.data?.EVM ?? {}, addresses);
          },
        },
      ), 2 * BITQUERY_POINTS.perRealtimeCube);
    },
  };
}
