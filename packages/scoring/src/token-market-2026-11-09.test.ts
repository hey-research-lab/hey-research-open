import { describe, expect, it } from 'vitest';

import { MARKET_INTEGRITY_RULES_VERSION, sustainedPeak, type IntegrityDay } from './market-integrity';
import { classifyTokenMarket, drainHeldToPeak, TOKEN_MARKET, TOKEN_MARKET_RULES_VERSION, type DrainEvidence } from './token-market';

/*
 * The data-trust audit's market repairs (2026-11-09, lane C, founder
 * delegation): the removal test's held level is capped at the token's own
 * liquidity high (P2-1), and the high skips a close read beside an
 * implausible valuation (P3). The pool index's v4 keying and one-sided pools
 * (P1-2) are the adapter's and the sweep's SQL, tested in `@hey/sources` and
 * `@hey/domain`. Each only withholds.
 */
const now = new Date('2026-11-09T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const level = (held: number) => Math.max(TOKEN_MARKET.dustLiquidityUsd, Math.min(TOKEN_MARKET.removedMaxAbsoluteUsd, held * TOKEN_MARKET.removedShareOfPeak));
const drainOf = (heldUsd: number, days = 3): DrainEvidence => ({
  series: 'chain',
  heldUsd,
  levelUsd: level(heldUsd),
  since: daysAgo(days),
  lastAt: daysAgo(0),
  days,
});

describe('token-market-2026-11-09', () => {
  it('is the rules version, and Market Integrity moves with it', () => {
    // Or a later version: token-market-2026-11-10 (and mi-v6) keep every rule this file holds.
    expect(TOKEN_MARKET_RULES_VERSION >= 'token-market-2026-11-09').toBe(true);
    expect(['mi-v5', 'mi-v6']).toContain(MARKET_INTEGRITY_RULES_VERSION);
  });
});

describe('the removal test is held to the token\'s own liquidity high (P2-1)', () => {
  it('caps the held level and its drain level at the high, and only lowers them', () => {
    const capped = drainHeldToPeak(drainOf(247_000), 18_555);
    expect(capped.heldUsd).toBe(18_555);
    expect(capped.levelUsd).toBeCloseTo(1_855.5, 6);
    // Under the high, or no high read: unchanged.
    expect(drainHeldToPeak(drainOf(9_000), 18_555)).toEqual(drainOf(9_000));
    expect(drainHeldToPeak(drainOf(247_000), undefined)).toEqual(drainOf(247_000));
    // The lower of the two levels stands: the cap never raises a level the sweep measured.
    const sweep = { ...drainOf(247_000), levelUsd: 900 };
    expect(drainHeldToPeak(sweep, 18_555).levelUsd).toBe(900);
  });

  it('no longer reads chinapad "Liquidity no longer detected" at its own high', () => {
    // A $247K one-sided PoolManager row set the level; the real pool never passed $19,753 and stands at $18,661.
    const chinapad = { now, latest: { observedAt: daysAgo(0), liquidityUsd: 18_661, volume24hUsd: 3_000 }, heldLiquidityUsd: 247_000, drain: drainOf(247_000) };
    expect(classifyTokenMarket(chinapad)).toMatchObject({ status: 'LIQUIDITY_REMOVED', reason: 'liquidity_far_below_peak' });
    expect(classifyTokenMarket({ ...chinapad, peakLiquidityUsd: 18_555 })).toEqual({ status: 'ACTIVE_MARKET', reason: 'liquidity_and_volume' });
  });

  it('withholds a removal whose high never reached the market line, and never calls it "no liquidity"', () => {
    // stonk-inu's shape: a series held $6K on two readings, the closes never held a level.
    const dust = { now, latest: { observedAt: daysAgo(0), liquidityUsd: 40, volume24hUsd: 0 }, heldLiquidityUsd: 6_000, drain: drainOf(6_000) };
    expect(classifyTokenMarket(dust)).toMatchObject({ status: 'LIQUIDITY_REMOVED', reason: 'liquidity_gone_after_market' });
    expect(classifyTokenMarket({ ...dust, peakLiquidityUsd: 0 })).toEqual({ status: 'INSUFFICIENT_DATA', reason: 'removal_unconfirmed' });
  });

  it('keeps a removal the high stands behind', () => {
    const drained = { now, latest: { observedAt: daysAgo(0), liquidityUsd: 515, volume24hUsd: 0 }, peakLiquidityUsd: 38_305, heldLiquidityUsd: 40_135, drain: drainOf(40_135) };
    expect(classifyTokenMarket(drained)).toMatchObject({ status: 'LIQUIDITY_REMOVED' });
  });
});

describe('the liquidity high skips a close beside an implausible valuation (P3)', () => {
  const day = (d: string, liquidityUsd: number, valuationImplausible?: true): IntegrityDay => ({
    day: d,
    liquidityUsd,
    volumeUsd: null,
    trades: null,
    ...(valuationImplausible ? { valuationImplausible } : {}),
  });

  it('pairs only plausible closes', () => {
    // atlantis-coin: $31M closes read beside a $349B valuation, around a market of about $1.3K.
    const days = [day('2026-11-01', 1_300), day('2026-11-02', 31_000_000, true), day('2026-11-03', 31_200_000, true), day('2026-11-04', 1_250), day('2026-11-05', 1_280)];
    expect(sustainedPeak(days.map(({ valuationImplausible: _skip, ...rest }) => rest))?.usd).toBe(31_000_000);
    expect(sustainedPeak(days)).toEqual({ usd: 1_250, day: '2026-11-05' });
    // The closes on either side of a skipped one still pair, inside the gap the rule allows.
    expect(sustainedPeak([day('2026-11-01', 1_300), day('2026-11-02', 31_000_000, true), day('2026-11-03', 1_250)])).toEqual({ usd: 1_250, day: '2026-11-01' });
  });

  it('holds no high when only implausible closes held one', () => {
    expect(sustainedPeak([day('2026-11-02', 31_000_000, true), day('2026-11-03', 31_200_000, true)])).toBeNull();
  });
});
