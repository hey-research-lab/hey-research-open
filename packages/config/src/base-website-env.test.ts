import { describe, expect, it } from 'vitest';

import { parseServerEnv, safeParseServerEnv } from './env';

/** `base-website`'s daily cap on a host (2026-11-24, founder "2. naikkan"; D14): unset is the code's figure. */
describe('HEY_BASE_WEBSITE_DAILY_READS', () => {
  const base = { DATABASE_URL: 'postgresql://hey:hey@localhost:5432/hey_research' };

  it("is the code's figure when unset or empty", () => {
    expect(parseServerEnv(base).baseBudgets.websiteDailyReads).toBeUndefined();
    expect(parseServerEnv({ ...base, HEY_BASE_WEBSITE_DAILY_READS: '' }).baseBudgets.websiteDailyReads).toBeUndefined();
  });

  it('reads a whole number from 0 to 5,000', () => {
    expect(parseServerEnv({ ...base, HEY_BASE_WEBSITE_DAILY_READS: '600' }).baseBudgets.websiteDailyReads).toBe(600);
    expect(parseServerEnv({ ...base, HEY_BASE_WEBSITE_DAILY_READS: '0' }).baseBudgets.websiteDailyReads).toBe(0);
    expect(parseServerEnv({ ...base, HEY_BASE_WEBSITE_DAILY_READS: '5000' }).baseBudgets.websiteDailyReads).toBe(5_000);
  });

  it('refuses anything else at load, naming the variable', () => {
    for (const value of ['-1', '1.5', '5001', 'lots']) {
      const parsed = safeParseServerEnv({ ...base, HEY_BASE_WEBSITE_DAILY_READS: value });
      expect(parsed.ok, value).toBe(false);
      if (parsed.ok) continue;
      expect([...parsed.variables]).toEqual(['HEY_BASE_WEBSITE_DAILY_READS']);
    }
  });
});
