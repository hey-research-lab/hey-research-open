import { describe, expect, it } from 'vitest';

import { isProofOfShipAttesterConfigured, parseServerEnv, safeParseServerEnv } from './env';
import { isNearMainnetAccountId } from './near-account';

/** Proof of Ship (2026-10-24): off unless the attester key is set; the key is never echoed. */
describe('Proof of Ship configuration', () => {
  const base = { DATABASE_URL: 'postgresql://hey:hey@localhost:5432/hey_research' };
  const KEY = `0x${'ab'.repeat(32)}`;

  it('is off with nothing set, and no key or escrow is invented', () => {
    const env = parseServerEnv(base);
    expect(env.proofOfShip).toEqual({ attesterKey: undefined, escrowAddresses: [], nearEscrows: [] });
    expect(isProofOfShipAttesterConfigured(env)).toBe(false);
  });

  it('turns on with the key, and reads the escrows lower-cased and trimmed', () => {
    const env = parseServerEnv({
      ...base,
      HEY_SHIP_ATTESTER_KEY: KEY,
      HEY_SHIP_ESCROW_ADDRESSES: ' 0x000000000000000000000000000000000000E5C0, 0x1111111111111111111111111111111111111111 ,',
    });
    expect(env.proofOfShip.attesterKey).toBeTruthy();
    expect(isProofOfShipAttesterConfigured(env)).toBe(true);
    expect(env.proofOfShip.escrowAddresses).toEqual(['0x000000000000000000000000000000000000e5c0', '0x1111111111111111111111111111111111111111']);
  });

  it('refuses a malformed key or escrow by name, never quoting the value', () => {
    const secret = `0x${'cd'.repeat(31)}`;
    const parsed = safeParseServerEnv({ ...base, HEY_SHIP_ATTESTER_KEY: secret, HEY_SHIP_ESCROW_ADDRESSES: '0x1234' });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect([...parsed.variables].sort()).toEqual(['HEY_SHIP_ATTESTER_KEY', 'HEY_SHIP_ESCROW_ADDRESSES']);
    expect(parsed.issues.join('\n')).not.toContain(secret);
  });

  it('reads the NEAR escrow accounts trimmed and exactly as written (2026-11-03, NEAR HACKATHON)', () => {
    const env = parseServerEnv({ ...base, HEY_SHIP_NEAR_ESCROWS: ' proof-of-ship.hey-research.near , escrow_2.near,' });
    expect(env.proofOfShip.nearEscrows).toEqual(['proof-of-ship.hey-research.near', 'escrow_2.near']);
    expect(parseServerEnv({ ...base, HEY_SHIP_NEAR_ESCROWS: '' }).proofOfShip.nearEscrows).toEqual([]);
  });

  it('refuses a NEAR escrow that is not a NEAR mainnet account id, by name — never lower-casing it', () => {
    for (const value of ['Proof-Of-Ship.near', 'near:escrow.near', 'escrow.testnet', 'a', 'bad..near', '-escrow.near', 'escrow-.near', 'esc--row.near', 'esc row.near', `${'a'.repeat(60)}.near`]) {
      const parsed = safeParseServerEnv({ ...base, HEY_SHIP_NEAR_ESCROWS: value });
      expect(parsed.ok, value).toBe(false);
      if (parsed.ok) continue;
      expect([...parsed.variables], value).toEqual(['HEY_SHIP_NEAR_ESCROWS']);
    }
  });
});

describe('a NEAR mainnet account id (NEAR\'s account-id rules)', () => {
  it('passes named, top-level and implicit accounts', () => {
    for (const id of ['near', 'aurora', 'hey.near', 'proof-of-ship.hey-research.near', 'a_b-c.d0.near', '0x'.concat('ab'.repeat(20)), 'ab'.repeat(32), 'ab']) {
      expect(isNearMainnetAccountId(id), id).toBe(true);
    }
  });

  it('refuses capitals, empty parts, edge or doubled separators, other characters, the wrong length and testnet', () => {
    for (const id of ['', 'a', 'A.near', 'hey..near', '.near', 'hey.', 'hey.near.', '_hey.near', 'hey_.near', 'he__y.near', 'he-_y.near', 'hey!.near', 'hey near', 'héy.near', 'a'.repeat(65), 'testnet', 'hey.testnet']) {
      expect(isNearMainnetAccountId(id), id).toBe(false);
    }
  });
});
