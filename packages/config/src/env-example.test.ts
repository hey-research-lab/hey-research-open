import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseServerEnv } from './env';

/**
 * Every variable the server environment reads is named in `.env.example`
 * (2026-09-24). Nine were not — among them the Terminal's own flag and the
 * worker's concurrency — so an operator setting up a host had no way to know
 * they existed.
 */
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
// The published subset of the source carries this package without the private root's example file. The private tree
// is told by packages/domain, which is never published, so there a moved example fails the read instead of skipping
// (2026-10-24 full audit, QA-14).
const PRIVATE_TREE = existsSync(fileURLToPath(new URL('../../domain/package.json', import.meta.url)));

describe.skipIf(!PRIVATE_TREE)('.env.example', () => {
  it('names every variable env.ts reads', () => {
    const source = read('./env.ts');
    const example = read('../../../.env.example');
    const keys = [...new Set([...source.matchAll(/\braw\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]!))];
    expect(keys.length).toBeGreaterThan(50);
    const named = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]!));
    expect(keys.filter((key) => !named.has(key))).toEqual([]);
  });
});

describe('reader feature kill switches', () => {
  const base = { DATABASE_URL: 'postgresql://hey:hey@localhost:5432/hey_research' };

  it('are on unless set to exactly "false"', () => {
    const on = parseServerEnv(base).hey;
    expect([on.askEnabled, on.compareEnabled, on.watchlistEnabled]).toEqual([true, true, true]);
    const off = parseServerEnv({ ...base, HEY_ASK_ENABLED: 'false', HEY_COMPARE_ENABLED: 'false', HEY_WATCHLIST_ENABLED: 'false' }).hey;
    expect([off.askEnabled, off.compareEnabled, off.watchlistEnabled]).toEqual([false, false, false]);
    expect(parseServerEnv({ ...base, HEY_ASK_ENABLED: '' }).hey.askEnabled).toBe(true);
  });
});

/**
 * Every variable a running process reads from its environment outside the schema is named in `.env.example` too
 * (multichain WP1.11, 2026-11-11): seven were not (the Bitquery concurrency, the MCP addresses and profile, the
 * migrator's lock wait, the access log path, the market page memo). Operator scripts (`apps/*\/src/scripts`) and test
 * files read their own flags and are not held here; the rest is listed below with what sets it.
 */
const SET_BY_THE_PLATFORM: Record<string, string> = {
  PORT: 'the Next.js server and the container set it; the hosted MCP derives its loopback address from it',
  PGTZ: 'the test database helper pins the session time zone',
  RATE_LIMIT_TEST_DIVISOR: 'the e2e server only (DATA_MODE=demo); production never reads it',
  HEY_WEBHOOK_SECRET: 'a usage example in the SDK documentation comment, not a read',
  PATH: 'the operating system; the deploy-script test harness passes it to the scripts it runs',
};

describe.skipIf(!PRIVATE_TREE)('.env.example and the variables read outside the schema', () => {
  it('names every process.env read of the runtime sources', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const path = await import('node:path');
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '__goldens__' || name === 'scripts') continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|mts)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) sources.push(full);
      }
    };
    for (const group of ['apps', 'packages']) {
      for (const pkg of readdirSync(path.join(root, group))) {
        const src = path.join(root, group, pkg, 'src');
        if (existsSync(src)) walk(src);
      }
    }
    expect(sources.length).toBeGreaterThan(500);
    const read = new Set<string>();
    for (const file of sources) {
      for (const match of readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) read.add(match[1]!);
    }
    const example = readFileSync(path.join(root, '.env.example'), 'utf8');
    const named = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]!));
    expect([...read].filter((key) => !named.has(key) && !(key in SET_BY_THE_PLATFORM)).sort()).toEqual([]);
    expect(Object.keys(SET_BY_THE_PLATFORM).filter((key) => !read.has(key))).toEqual([]);
  });
});
