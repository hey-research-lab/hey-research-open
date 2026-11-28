import { describe, expect, it } from 'vitest';

import { marketIntegrityExitLabelsVisible, parseServerEnv } from './env';

/**
 * Exit-pattern labels (2026-11-22, founder delegation): Terminal-only, behind a flag off by default until a
 * calibration review; never public. The older `HEY_MARKET_INTEGRITY_EXIT_LABELS` is retired and opens nothing.
 */
describe('exit-pattern labels', () => {
  const base = { DATABASE_URL: 'postgresql://hey:hey@localhost:5432/hey_research' };

  it('are off in the Terminal with nothing set, and the admin review always reads them', () => {
    const env = parseServerEnv({ ...base, HEY_MARKET_INTEGRITY: 'terminal' });
    expect(env.hey.marketIntegrityExitLabelsTerminal).toBe(false);
    expect(marketIntegrityExitLabelsVisible(env, 'terminal')).toBe(false);
    expect(marketIntegrityExitLabelsVisible(env, 'admin')).toBe(true);
  });

  it('open the Terminal only with the Terminal flag exactly "true" and Market Integrity reaching the Terminal', () => {
    expect(marketIntegrityExitLabelsVisible(parseServerEnv({ ...base, HEY_MARKET_INTEGRITY_EXIT_LABELS_TERMINAL: 'true' }), 'terminal')).toBe(false);
    for (const exposure of ['terminal', 'public']) {
      expect(marketIntegrityExitLabelsVisible(parseServerEnv({ ...base, HEY_MARKET_INTEGRITY: exposure, HEY_MARKET_INTEGRITY_EXIT_LABELS_TERMINAL: 'true' }), 'terminal'), exposure).toBe(true);
    }
    for (const value of ['1', 'yes', 'TRUE', 'on', '']) {
      expect(marketIntegrityExitLabelsVisible(parseServerEnv({ ...base, HEY_MARKET_INTEGRITY: 'terminal', HEY_MARKET_INTEGRITY_EXIT_LABELS_TERMINAL: value }), 'terminal'), value).toBe(false);
    }
  });

  it('are never public, whatever any flag says', () => {
    const everything = parseServerEnv({ ...base, HEY_MARKET_INTEGRITY: 'public', HEY_MARKET_INTEGRITY_EXIT_LABELS: 'true', HEY_MARKET_INTEGRITY_EXIT_LABELS_TERMINAL: 'true' });
    expect(marketIntegrityExitLabelsVisible(everything, 'public')).toBe(false);
  });

  it('read nothing from the retired flag', () => {
    const retired = parseServerEnv({ ...base, HEY_MARKET_INTEGRITY: 'public', HEY_MARKET_INTEGRITY_EXIT_LABELS: 'true' });
    expect(marketIntegrityExitLabelsVisible(retired, 'terminal')).toBe(false);
    expect(marketIntegrityExitLabelsVisible(retired, 'public')).toBe(false);
  });
});
