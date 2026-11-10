import { describe, expect, it } from 'vitest';

import { parseServerEnv } from './env';
import { goldenJson, goldenShape, GOLDEN_UNDEFINED } from './golden';

/**
 * Golden baseline of the parsed server environment (multichain WP1.0, 2026-11-11).
 *
 * WP1.1 adds a chain registry and per-chain settings while `env.chain` stays the home alias: with no new variable
 * set, `env.chain` must deep-equal what it is today, and every other parsed setting must keep its value. These goldens
 * hold both, from two fixture environments that name no secret: the minimal local one, and one shaped like
 * production's `.env.production.example` (Robinhood Chain's RPC and explorer, the `$HEY` launch settings).
 *
 * A change here is a change to what every job and route reads at boot. Update a golden only on purpose
 * (`pnpm vitest run --project unit -u packages/config/src/golden.test.ts`) and say why in the commit.
 */
const MINIMAL = { DATABASE_URL: 'postgresql://hey:hey@localhost:5432/hey_research' };

const PRODUCTION_SHAPED = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://hey:hey@localhost:5432/hey_research',
  APP_URL: 'https://heyresearch.xyz',
  HEY_DOMAIN: 'heyresearch.xyz',
  RH_RPC_URL: 'https://rpc.mainnet.chain.robinhood.com',
  RH_BLOCKSCOUT_BASE_URL: 'https://robinhoodchain.blockscout.com',
  HEY_TOKEN_STATUS: 'live',
  HEY_TOKEN_ADDRESS: '0x1234567890abcdef1234567890abcdef12345678',
  HEY_PONS_VERSION: 'v2',
  HEY_PONS_FACTORY: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
  HEY_PONS_LAUNCH_CONFIG_ID: '0',
  HEY_CREATOR_TAX_BPS: '200',
  HEY_PAYMENT_CONFIRMATIONS: '30',
  HEY_ERC8004_VALIDATOR_ENABLED: 'false',
};

describe('golden: the parsed server environment', () => {
  it('the minimal environment parses to the recorded settings', async () => {
    await expect(goldenJson(parseServerEnv(MINIMAL))).toMatchFileSnapshot('./__goldens__/server-env.minimal.json');
  });

  it('a production-shaped environment parses to the recorded settings', async () => {
    await expect(goldenJson(parseServerEnv(PRODUCTION_SHAPED))).toMatchFileSnapshot('./__goldens__/server-env.production-shaped.json');
  });

  it('env.chain, the home chain WP1.1 keeps as an alias, is recorded on its own', async () => {
    const chains = { minimal: parseServerEnv(MINIMAL).chain, productionShaped: parseServerEnv(PRODUCTION_SHAPED).chain };
    await expect(goldenJson(chains)).toMatchFileSnapshot('./__goldens__/env-chain.json');
  });
});

describe('the golden helpers', () => {
  it('goldenJson tells a key with no value apart from a missing key, and keeps emission order', () => {
    expect(goldenJson({ b: 1, a: undefined })).toBe(`{\n  "b": 1,\n  "a": "${GOLDEN_UNDEFINED}"\n}\n`);
    expect(goldenJson({ s: new Set([2, 1]), m: new Map([['k', 1n]]) })).toBe('{\n  "s": [\n    2,\n    1\n  ],\n  "m": {\n    "k": "1n"\n  }\n}\n');
  });

  it('goldenShape keeps keys and types, the values of kept keys, and folds array items into one shape', () => {
    const shape = JSON.parse(
      goldenShape(
        { chainId: 4663, found: true, items: [{ id: 'a', n: 1 }, { id: 'b', extra: null }], at: new Date(0), nested: { status: 'ok', count: 3 } },
        { keep: ['chainId', 'found', 'status'] },
      ),
    ) as unknown;
    expect(shape).toEqual({ chainId: '4663', found: 'true', items: [{ id: 'string', n: 'number', extra: 'null' }], at: 'date', nested: { status: '"ok"', count: 'number' } });
    expect(JSON.parse(goldenShape({ v: [1, 'x', null] })) as unknown).toEqual({ v: ['null|number|string'] });
    expect(JSON.parse(goldenShape({ v: [{ a: 1 }], e: [] }, { arrayItems: false })) as unknown).toEqual({ v: 'array', e: 'array' });
  });
});
