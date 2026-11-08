import { describe, expect, it } from 'vitest';

import { readFixture, stubFetch, testContext } from '../testing';
import { BITQUERY_POOLS_QUERY, createBitqueryPoolsAdapter, normalizeBitqueryPools, ONE_SIDED_QUOTE_SHARE, poolIsOneSided, poolKeyOf, V4_POOL_MANAGER } from './bitquery-pools';

const HEY = '0xb33eb16782776b4d738c0fd643577cb0284db610';
const PONS = '0x39dbed3a2bd333467115de45665cc57f813c4571';
const ETH = '0x0000000000000000000000000000000000000000';
/** The v4 PoolManager: every v4 pool's contract. */
const POOL_A = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const POOL_B = '0xe2c6b7056eba176add3097ff537114c11db0db18';
/** HEY's one pool is a Uniswap v4 pool: the PoolManager's row, named by its PoolId (2026-11-09). */
const HEY_POOL_ID = '0x5f1c1cbbf4d5e2bba9b4a6c3d5e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809';

describe('bitquery pools', () => {
  it('matches a token on either side of the pool', () => {
    // $HEY is CurrencyB in its only pool. A one-sided filter finds nothing for
    // it at all, which is why both cubes use `any:` (2026-09-15).
    expect(BITQUERY_POOLS_QUERY).toContain('CurrencyA: { SmartContract: { in: $addresses } }');
    expect(BITQUERY_POOLS_QUERY).toContain('CurrencyB: { SmartContract: { in: $addresses } }');
    expect(BITQUERY_POOLS_QUERY).toContain('SlippageBasisPoints: { eq: 100 }');
  });

  it('adds both sides of every pool and counts the pools once', () => {
    const rows = normalizeBitqueryPools(
      {
        pools: [
          // The real shape: ETH is A, HEY is B.
          { PoolEvent: { Pool: { SmartContract: POOL_A, PoolId: HEY_POOL_ID, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, Liquidity: { a: 20512.723, b: 20425.15 } }, events: '835' },
          { PoolEvent: { Pool: { SmartContract: POOL_B, CurrencyA: { SmartContract: PONS }, CurrencyB: { SmartContract: ETH } }, Liquidity: { a: 7516.95, b: 7421.34 } }, events: '12' },
          // A second event on a pool already seen must not count it twice.
          { PoolEvent: { Pool: { SmartContract: POOL_B, CurrencyA: { SmartContract: PONS }, CurrencyB: { SmartContract: ETH } }, Liquidity: { a: 0, b: 0 } }, events: '4' },
        ],
        depth: [],
      },
      [HEY, PONS],
    );
    const hey = rows.find((row) => row.tokenAddress === HEY);
    expect(hey).toMatchObject({ pools: 1, events: 835 });
    expect(hey?.liquidityUsd).toBeCloseTo(40_937.873, 3);
    expect(rows.find((row) => row.tokenAddress === PONS)).toMatchObject({ pools: 1, events: 16 });
  });

  it('keeps each pool on its own, with the side that is not the token (2026-09-26)', () => {
    const POOL_C = '0x' + 'c'.repeat(64);
    const rows = normalizeBitqueryPools(
      {
        pools: [
          { PoolEvent: { Pool: { SmartContract: POOL_A, PoolId: HEY_POOL_ID, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, Liquidity: { a: 300, b: 100 } }, events: '3' },
          // A second reading of the same pool never replaces the first priced one.
          { PoolEvent: { Pool: { SmartContract: POOL_A, PoolId: HEY_POOL_ID, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, Liquidity: { a: 9, b: 9 } }, events: '1' },
          // A v4 pool id, HEY on side A: its quote is B.
          { PoolEvent: { Pool: { SmartContract: POOL_C, CurrencyA: { SmartContract: HEY }, CurrencyB: { SmartContract: ETH } }, Liquidity: { a: 40, b: 60 } }, events: '2' },
          // Priced at nothing on every side: an empty pool, 0 rather than unknown.
          { PoolEvent: { Pool: { SmartContract: POOL_B, CurrencyA: { SmartContract: HEY }, CurrencyB: { SmartContract: ETH } }, Liquidity: { a: 0, b: 0 } }, events: '1' },
        ],
        depth: [],
      },
      [HEY],
    );
    const hey = rows.find((row) => row.tokenAddress === HEY)!;
    expect(hey.venues).toEqual([
      { pool: HEY_POOL_ID, liquidityUsd: 400, quoteSideUsd: 300 },
      { pool: POOL_C, liquidityUsd: 100, quoteSideUsd: 60 },
      { pool: POOL_B, liquidityUsd: 0, quoteSideUsd: 0 },
    ]);
    // The parts add up to the whole the token's row already carried.
    expect(hey.liquidityUsd).toBeCloseTo(500, 6);
  });

  it('reads the depth in the direction that sells the token', () => {
    const rows = normalizeBitqueryPools(
      {
        pools: [],
        depth: [
          // HEY is B, so selling it is B→A and only `sellingB` is its depth.
          { Price: { Pool: { SmartContract: POOL_A, PoolId: HEY_POOL_ID, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, AtoB: { sellingA: 9.5 }, BtoA: { sellingB: 1200 } } },
          // PONS is A, so selling it is A→B.
          { Price: { Pool: { SmartContract: POOL_B, CurrencyA: { SmartContract: PONS }, CurrencyB: { SmartContract: ETH } }, AtoB: { sellingA: 611.957 }, BtoA: { sellingB: 4.1 } } },
          { Price: { Pool: { SmartContract: '0xaa241a27c911027b0f3236ec89d4db21269064da', CurrencyA: { SmartContract: PONS }, CurrencyB: { SmartContract: ETH } }, AtoB: { sellingA: 0.556 }, BtoA: { sellingB: 1 } } },
        ],
      },
      [HEY, PONS],
    );
    expect(rows.find((row) => row.tokenAddress === HEY)?.depthOnePctBase).toBeCloseTo(1200, 3);
    // Depth adds up across a token's pools.
    expect(rows.find((row) => row.tokenAddress === PONS)?.depthOnePctBase).toBeCloseTo(612.513, 3);
  });

  it('ignores a pool of two tokens it was not asked about', () => {
    const rows = normalizeBitqueryPools(
      { pools: [{ PoolEvent: { Pool: { SmartContract: POOL_B, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: PONS } }, Liquidity: { a: 5, b: 5 } }, events: '1' }], depth: [] },
      [HEY],
    );
    expect(rows).toEqual([]);
  });

  it('asks both cubes for the v4 pool id (2026-11-09)', () => {
    // Every v4 pool lives inside the one PoolManager: without the id, all of a token's v4 pools were one row.
    expect(BITQUERY_POOLS_QUERY.match(/SmartContract\n\s+PoolId/g)?.length).toBe(2);
    expect(V4_POOL_MANAGER).toBe(POOL_A);
  });

  it('keys a PoolManager row by its PoolId, and any other pool by its contract', () => {
    expect(poolKeyOf({ SmartContract: '0x8366A39CC670B4001A1121B8F6A443A643E40951', PoolId: HEY_POOL_ID.toUpperCase().replace('0X', '0x') })).toBe(HEY_POOL_ID);
    // No 32-byte id from the PoolManager: a pool the index cannot hold.
    expect(poolKeyOf({ SmartContract: POOL_A, PoolId: '' })).toBeNull();
    expect(poolKeyOf({ SmartContract: POOL_A, PoolId: POOL_B })).toBeNull();
    expect(poolKeyOf({ SmartContract: POOL_A })).toBeNull();
    // A v2/v3 pool is its contract, whatever its PoolId says.
    expect(poolKeyOf({ SmartContract: POOL_B, PoolId: HEY_POOL_ID })).toBe(POOL_B);
    expect(poolKeyOf({ SmartContract: null })).toBeUndefined();
  });

  it('keeps every v4 pool of a token, not the first one the PoolManager answered (2026-11-09, P1-2)', () => {
    const ID_1 = '0x' + '1'.repeat(64);
    const ID_2 = '0x' + '2'.repeat(64);
    const rows = normalizeBitqueryPools(
      {
        pools: [
          { PoolEvent: { Pool: { SmartContract: POOL_A, PoolId: ID_1, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, Liquidity: { a: 27, b: 0.5 } }, events: '2' },
          { PoolEvent: { Pool: { SmartContract: POOL_A, PoolId: ID_2, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, Liquidity: { a: 437_500, b: 437_400 } }, events: '900' },
        ],
        depth: [
          { Price: { Pool: { SmartContract: POOL_A, PoolId: ID_1, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, AtoB: { sellingA: 1 }, BtoA: { sellingB: 2 } } },
          { Price: { Pool: { SmartContract: POOL_A, PoolId: ID_2, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, AtoB: { sellingA: 1 }, BtoA: { sellingB: 50_000 } } },
        ],
      },
      [HEY],
    );
    const hey = rows[0]!;
    expect(hey.pools).toBe(2);
    expect(hey.liquidityUsd).toBeCloseTo(874_927.5, 3);
    expect(hey.depthOnePctBase).toBeCloseTo(50_002, 6);
    expect(hey.venues?.map((venue) => venue.pool)).toEqual([ID_2, ID_1]);
    expect(hey.poolsNotIndexed).toBeUndefined();
  });

  it('leaves a one-sided pool out of the depth, and names it with its quote side for the readers of the index', () => {
    const DEEP = '0x' + '1'.repeat(64);
    const ONE_SIDED = '0x' + '3'.repeat(64);
    const rows = normalizeBitqueryPools(
      {
        pools: [
          { PoolEvent: { Pool: { SmartContract: POOL_A, PoolId: DEEP, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, Liquidity: { a: 9_000, b: 9_655 } }, events: '40' },
          // chinapad's shape: $247K of the token itself beside $1 of the quote asset.
          { PoolEvent: { Pool: { SmartContract: POOL_A, PoolId: ONE_SIDED, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, Liquidity: { a: 1, b: 247_000 } }, events: '2' },
        ],
        depth: [
          { Price: { Pool: { SmartContract: POOL_A, PoolId: DEEP, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, AtoB: { sellingA: 1 }, BtoA: { sellingB: 400 } } },
          { Price: { Pool: { SmartContract: POOL_A, PoolId: ONE_SIDED, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, AtoB: { sellingA: 1 }, BtoA: { sellingB: 90_000 } } },
        ],
      },
      [HEY],
    );
    const hey = rows[0]!;
    expect(hey.pools).toBe(2);
    // The sum and the venues keep it, as every day before the rule did: the readers subtract it.
    expect(hey.liquidityUsd).toBeCloseTo(18_655 + 247_001, 6);
    expect(hey.depthOnePctBase).toBeCloseTo(400, 6);
    expect(hey.venues).toEqual([
      { pool: ONE_SIDED, liquidityUsd: 247_001, quoteSideUsd: 1 },
      { pool: DEEP, liquidityUsd: 18_655, quoteSideUsd: 9_000 },
    ]);
  });

  it('calls a pool one-sided only under the share, and only when its quote side was priced', () => {
    const ID = '0x' + '4'.repeat(64);
    const depthOf = (a: number | null, b: number) =>
      normalizeBitqueryPools(
        {
          pools: [{ PoolEvent: { Pool: { SmartContract: POOL_A, PoolId: ID, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, Liquidity: { a, b } }, events: '1' }],
          depth: [{ Price: { Pool: { SmartContract: POOL_A, PoolId: ID, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, AtoB: { sellingA: 1 }, BtoA: { sellingB: 70 } } }],
        },
        [HEY],
      )[0]!.depthOnePctBase;
    // Exactly the share of the pool is not under it.
    const at = 100 * ONE_SIDED_QUOTE_SHARE;
    expect(depthOf(at, 100 - at)).toBeCloseTo(70, 6);
    // A quote side priced at 0 is measured, and one-sided: no depth, never 0.
    expect(depthOf(0, 5_000)).toBeUndefined();
    // An unpriced quote side is unknown, and never makes a pool one-sided.
    expect(depthOf(null, 5_000)).toBeCloseTo(70, 6);
    expect(poolIsOneSided({ liquidityUsd: 5_000, quoteSideUsd: 1, quoteMeasured: true })).toBe(true);
    expect(poolIsOneSided({ liquidityUsd: 5_000, quoteSideUsd: 1 })).toBe(false);
  });

  it('holds no figure for a token the PoolManager answered without a PoolId', () => {
    const rows = normalizeBitqueryPools(
      {
        pools: [
          { PoolEvent: { Pool: { SmartContract: POOL_B, CurrencyA: { SmartContract: HEY }, CurrencyB: { SmartContract: ETH } }, Liquidity: { a: 60, b: 40 } }, events: '3' },
          { PoolEvent: { Pool: { SmartContract: POOL_A, CurrencyA: { SmartContract: ETH }, CurrencyB: { SmartContract: HEY } }, Liquidity: { a: 247_000, b: 1 } }, events: '9' },
        ],
        depth: [{ Price: { Pool: { SmartContract: POOL_B, CurrencyA: { SmartContract: HEY }, CurrencyB: { SmartContract: ETH } }, AtoB: { sellingA: 3 }, BtoA: { sellingB: 1 } } }],
      },
      [HEY],
    );
    const hey = rows[0]!;
    expect(hey.poolsNotIndexed).toBe(true);
    expect(hey.liquidityUsd).toBeUndefined();
    expect(hey.depthOnePctBase).toBeUndefined();
    expect(hey.events).toBe(12);
    // The pools it does hold stay named; the PoolManager is named as the pool it does not.
    expect(hey.venues).toEqual([
      { pool: POOL_B, liquidityUsd: 100, quoteSideUsd: 40 },
      { pool: POOL_A, notIndexed: true },
    ]);
  });

  it('refuses a batch larger than the provider takes', () => {
    const adapter = createBitqueryPoolsAdapter();
    const many = Array.from({ length: 101 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}`);
    expect(adapter.canHandle({ addresses: many, since: new Date(), apiKey: 'k' })).toBe(false);
    expect(adapter.canHandle({ addresses: [HEY], since: new Date(), apiKey: '' })).toBe(false);
    expect(adapter.canHandle({ addresses: [HEY], since: new Date(), apiKey: 'k' })).toBe(true);
  });
});

/*
 * The cases above hand literals to the normaliser, so the Zod schema never ran
 * (round 9, 2026-09-19) — architecture rule 16 on the paid source. The fixture
 * carries the same two pools asserted above, in the envelope the adapter
 * actually receives; Bitquery is keyed and metered and no test calls it.
 */
const json = (body: string) => ({ status: 200, body, headers: { 'content-type': 'application/json' } });
const fixture = () => JSON.parse(readFixture('bitquery-pools.json')) as {
  data: { EVM: { pools: Record<string, unknown>[]; depth: Record<string, unknown>[] } };
};

describe('bitquery pools, through the schema', () => {
  const adapter = createBitqueryPoolsAdapter();
  const input = { addresses: [HEY, PONS], since: new Date('2026-09-14T00:00:00Z'), apiKey: 'test-token' };

  it('validates the saved envelope, counts each pool once and reads depth in the selling direction', async () => {
    const stub = stubFetch(json(readFixture('bitquery-pools.json')));
    const result = await adapter.fetch(input, testContext({ fetchImpl: stub.fetchImpl }));

    expect(result.status).toBe('fresh');
    const hey = result.data?.find((row) => row.tokenAddress === HEY);
    expect(hey).toMatchObject({ pools: 1, events: 835 });
    expect(hey?.liquidityUsd).toBeCloseTo(40_937.873, 3);
    // HEY is CurrencyB, so its depth is the B→A side only.
    expect(hey?.depthOnePctBase).toBeCloseTo(1200, 3);
    const pons = result.data?.find((row) => row.tokenAddress === PONS);
    // A second event on a pool already seen must not count or bank it twice.
    expect(pons).toMatchObject({ pools: 1, events: 16 });
    expect(pons?.depthOnePctBase).toBeCloseTo(612.513, 3);
  });

  it('reads a multi-pool v4 token pool by pool, and a token it cannot key as not indexed', async () => {
    // Hand-built in the shape the document now asks for (no provider is called in a test): three v4 pools of one
    // token — ETH, USDC and a one-sided pool — and a second token whose PoolManager row carries no PoolId.
    const TOKEN = '0x7a1e0b4b2c94bd2b5d0c0fc1b6f5e0f3f4a5b6c7';
    const OTHER = '0x9b8a7c6d5e4f30211203f4e5d6c7b8a9f0e1d2c3';
    const stub = stubFetch(json(readFixture('bitquery-pools-v4.json')));
    const result = await adapter.fetch({ addresses: [TOKEN, OTHER], since: new Date('2026-11-08T00:00:00Z'), apiKey: 'test-token' }, testContext({ fetchImpl: stub.fetchImpl }));

    expect(result.status).toBe('fresh');
    const token = result.data?.find((row) => row.tokenAddress === TOKEN);
    expect(token?.pools).toBe(3);
    // Every pool counted once by its PoolId, the one-sided pool included: the readers of the index subtract it.
    expect(token?.liquidityUsd).toBeCloseTo(437_500.5 + 437_400.25 + 12.5 + 14.75 + 247_001, 3);
    // The token is B in the first pool and A in the second; the one-sided pool's depth is left out.
    expect(token?.depthOnePctBase).toBeCloseTo(52_003, 6);
    expect(token?.venues?.map((venue) => venue.pool)).toEqual(['0x' + '1'.repeat(64), '0x' + '3'.repeat(64), '0x' + '2'.repeat(64)]);
    expect(token?.venues?.[1]).toEqual({ pool: '0x' + '3'.repeat(64), liquidityUsd: 247_001, quoteSideUsd: 1 });
    const other = result.data?.find((row) => row.tokenAddress === OTHER);
    expect(other).toMatchObject({ poolsNotIndexed: true, pools: 0, events: 4 });
    expect(other?.liquidityUsd).toBeUndefined();
  });

  it('refuses an envelope whose pool wrapper was renamed', async () => {
    // `PoolEvent { Pool }` is required on every row. A rename would leave every
    // token with no pools and no liquidity, which reads as a dead market.
    const body = fixture();
    body.data.EVM.pools[0] = { PoolEvents: body.data.EVM.pools[0]!.PoolEvent, events: '835' };
    const stub = stubFetch(json(JSON.stringify(body)));
    const result = await adapter.fetch(input, testContext({ fetchImpl: stub.fetchImpl }));

    expect(result.status).toBe('error');
    expect(result.errorCode).toBe('INVALID_RESPONSE');
  });

  it('refuses a pool address that arrives as a number', async () => {
    const body = fixture();
    ((body.data.EVM.depth[0]!.Price as Record<string, unknown>).Pool as Record<string, unknown>).SmartContract = 42;
    const stub = stubFetch(json(JSON.stringify(body)));
    const result = await adapter.fetch(input, testContext({ fetchImpl: stub.fetchImpl }));

    expect(result.errorCode).toBe('INVALID_RESPONSE');
  });
});
