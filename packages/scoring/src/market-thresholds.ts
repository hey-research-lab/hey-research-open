import { DISCOVERY_GAP, STILL_BUILDING, UNDER_THE_RADAR } from './config';
import { MARKET_INTEGRITY } from './market-integrity';
import { TOKEN_MARKET } from './token-market';
import { VALUATION_PLAUSIBILITY } from './valuation-plausibility';

/**
 * The market thresholds per chain (multichain WP1.8, 2026-11-12; D3).
 *
 * Every market threshold HEY applies — what an active market is, when a market is too thin to measure, when a
 * valuation is plausible, when a liquidity move is a removal, the Discovery Gap, Under the Radar and Still Building —
 * was set and calibrated on Robinhood Chain's markets. Another chain's markets are not measured until a ruling sets
 * its thresholds: `marketThresholdsFor` answers null, which a caller reads as "not measured on this chain", never as a
 * zero or a pass. The answer for Robinhood Chain is the very constants the rules read (the same objects), so nothing
 * Robinhood Chain reads moves and the scoring rules digest is unchanged.
 *
 * The chain is the valuation gate's own (`VALUATION_PLAUSIBILITY.chainId`, held equal to `ROBINHOOD_CHAIN_ID` by its
 * test): `@hey/scoring` reads no configuration.
 */
export type MarketThresholds = {
  readonly chainId: number;
  readonly tokenMarket: typeof TOKEN_MARKET;
  readonly discoveryGap: typeof DISCOVERY_GAP;
  readonly underTheRadar: typeof UNDER_THE_RADAR;
  readonly stillBuilding: typeof STILL_BUILDING;
  readonly valuationPlausibility: typeof VALUATION_PLAUSIBILITY;
  readonly marketIntegrity: typeof MARKET_INTEGRITY;
};

const ROBINHOOD_MARKET_THRESHOLDS: MarketThresholds = {
  chainId: VALUATION_PLAUSIBILITY.chainId,
  tokenMarket: TOKEN_MARKET,
  discoveryGap: DISCOVERY_GAP,
  underTheRadar: UNDER_THE_RADAR,
  stillBuilding: STILL_BUILDING,
  valuationPlausibility: VALUATION_PLAUSIBILITY,
  marketIntegrity: MARKET_INTEGRITY,
};

/** The chains whose markets HEY measures: Robinhood Chain alone until a ruling adds one. */
export const MARKET_MEASURED_CHAINS: readonly number[] = [ROBINHOOD_MARKET_THRESHOLDS.chainId];

/** A chain's market thresholds, or null: not measured on this chain (never a zero, never a pass). */
export function marketThresholdsFor(chainId: number): MarketThresholds | null {
  return chainId === ROBINHOOD_MARKET_THRESHOLDS.chainId ? ROBINHOOD_MARKET_THRESHOLDS : null;
}
