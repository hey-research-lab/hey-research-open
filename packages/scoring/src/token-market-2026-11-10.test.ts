import { describe, expect, it } from 'vitest';

import { discoveryGapMarketMeasurable, marketIsLive } from './token-market';
import { READINGS_NOT_CONFIRMED_LABEL, tokenMarketStatusLabel, UNCONFIRMED_MARKET_REASONS } from './market-status-words';
import {
  classifyTokenMarket,
  DEAD_MARKET_REASONS,
  marketFiguresBelievable,
  QUOTE_SIDE_THIN_REASON,
  TOKEN_MARKET,
  TOKEN_MARKET_REASONS,
  TOKEN_MARKET_RULES_VERSION,
  type TokenMarketEvidence,
} from './token-market';

/**
 * token-market-2026-11-10 (founder delegation, overnight): a reading whose valuation trips the valuation gate's
 * `quote_side_thin` is no measured liquidity. blorb: "Liquidity $9.1M", "Active market", $8 of volume, a $268 quote side.
 */
const now = new Date('2026-11-10T12:00:00Z');
const blorb = (overrides: Partial<NonNullable<TokenMarketEvidence['latest']>> = {}): TokenMarketEvidence => ({
  now,
  latest: { observedAt: new Date(now.getTime() - 3_600_000), liquidityUsd: 9_100_000, volume24hUsd: 8, fdvUsd: 94_000_000, priceUsd: 0.094, ...overrides },
  chainIndex: { observedAt: new Date(now.getTime() - 3_600_000), liquidityUsd: 9_400_000 },
});

describe('token-market-2026-11-10', () => {
  it('is the rules version', () => {
    expect(TOKEN_MARKET_RULES_VERSION).toBe('token-market-2026-11-10');
  });

  it('reads a reading of the token\'s own supply as not measured, never ACTIVE_MARKET', () => {
    expect(classifyTokenMarket(blorb())).toEqual({ status: 'ACTIVE_MARKET', reason: 'liquidity_and_volume' });
    expect(classifyTokenMarket(blorb({ quoteSideThin: true }))).toEqual({ status: 'INSUFFICIENT_DATA', reason: QUOTE_SIDE_THIN_REASON });
  });

  it('leaves a small pool to the low-liquidity rules and a launch pool to its own', () => {
    expect(classifyTokenMarket(blorb({ quoteSideThin: true, liquidityUsd: TOKEN_MARKET.lowLiquidityUsd - 1 }))).toMatchObject({ status: 'LOW_LIQUIDITY' });
    expect(classifyTokenMarket(blorb({ quoteSideThin: true, liquidityUsd: 60_000_000, volume24hUsd: 500 }))).toEqual({ status: 'ACTIVE_MARKET', reason: 'launch_pool_trading' });
  });

  it('is live, not measured, labelled "Readings not confirmed", and its liquidity is withheld', () => {
    expect(TOKEN_MARKET_REASONS).toContain(QUOTE_SIDE_THIN_REASON);
    expect(UNCONFIRMED_MARKET_REASONS).toContain(QUOTE_SIDE_THIN_REASON);
    expect(DEAD_MARKET_REASONS as readonly string[]).not.toContain(QUOTE_SIDE_THIN_REASON);
    expect(marketIsLive('INSUFFICIENT_DATA', QUOTE_SIDE_THIN_REASON)).toBe(true);
    expect(discoveryGapMarketMeasurable('INSUFFICIENT_DATA', 'DEX', QUOTE_SIDE_THIN_REASON)).toBe(false);
    expect(tokenMarketStatusLabel('INSUFFICIENT_DATA', QUOTE_SIDE_THIN_REASON)).toBe(READINGS_NOT_CONFIRMED_LABEL);
    expect(marketFiguresBelievable(QUOTE_SIDE_THIN_REASON)).toBe(false);
    expect(marketFiguresBelievable('liquidity_and_volume')).toBe(true);
    expect(marketFiguresBelievable(null)).toBe(true);
  });
});
