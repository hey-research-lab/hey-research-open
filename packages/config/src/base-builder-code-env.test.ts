import { describe, expect, it } from 'vitest';

import { BASE_BUILDER_CODE_PATTERN, parseServerEnv, safeParseServerEnv } from './env';

/** HEY's Base builder code (2026-11-16, founder "buat 1"): off unless set, taken exactly as Base Dashboard gives it. */
describe('HEY_BASE_BUILDER_CODE', () => {
  const base = { DATABASE_URL: 'postgresql://hey:hey@localhost:5432/hey_research' };

  it('is off with nothing set or an empty value', () => {
    expect(parseServerEnv(base).erc8004Validator.baseBuilderCode).toBeUndefined();
    expect(parseServerEnv({ ...base, HEY_BASE_BUILDER_CODE: '' }).erc8004Validator.baseBuilderCode).toBeUndefined();
  });

  it('reads a code in the documented shape as given', () => {
    expect(parseServerEnv({ ...base, HEY_BASE_BUILDER_CODE: 'bc_b7k3p9da' }).erc8004Validator.baseBuilderCode).toBe('bc_b7k3p9da');
  });

  it('refuses any other shape at load, naming the variable, never tidying it', () => {
    for (const code of ['b7k3p9da', 'BC_B7K3P9DA', 'bc_B7K3P9DA', 'bc_b7k3p9d', 'bc_b7k3p9da1', 'bc_b7k3,p9d', 'bc_b7k3p9d!', 'bc_b7k3 p9d']) {
      const parsed = safeParseServerEnv({ ...base, HEY_BASE_BUILDER_CODE: code });
      expect(parsed.ok, code).toBe(false);
      if (parsed.ok) continue;
      expect([...parsed.variables]).toEqual(['HEY_BASE_BUILDER_CODE']);
    }
  });

  it('is one ERC-8021 schema-0 code: ASCII, no comma', () => {
    expect(BASE_BUILDER_CODE_PATTERN.test('bc_b7k3p9da')).toBe(true);
    expect(BASE_BUILDER_CODE_PATTERN.test('bc_b7k3p9da,bc_aaaaaaaa')).toBe(false);
  });
});
