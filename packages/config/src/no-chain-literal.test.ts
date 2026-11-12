import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * One chain-id constant, and no chain id read past the config parser (multichain WP1.2, invariant I15, 2026-11-11).
 *
 * Robinhood Chain's id is `ROBINHOOD_CHAIN_ID` in `constants.ts` (`@hey/config/constants`, safe for any bundle); ten
 * modules once defined their own `= 4663`, and nine scripts read `RH_CHAIN_ID` straight from `process.env`, skipping the
 * parser that `env.chain` and the chain lists rest on. A module that needs the id imports the constant (an exported name
 * stays as an alias of it); a script that needs the configured chain reads `getServerEnv().chain`.
 *
 * Tests and fixtures may write 4663: a fixture states a value, it does not define the chain. The scan reads whatever
 * source tree is present, so it also passes in the published subset, which carries fewer packages.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOTS = ['apps', 'packages', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', 'e2e', '__goldens__', 'fixtures', '.turbo']);
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;

const CONSTANT_HOME = 'packages/config/src/constants.ts';
const ENV_HOME = 'packages/config/src/env.ts';

/** `const X = 4663` (exported or not, with a type or not). */
const CHAIN_LITERAL_DEFINITION = /\bconst\s+[A-Za-z_$][\w$]*\s*(?::\s*[\w<>|\s]+?)?=\s*4663\b(?!\.)/;
/** `process.env.RH_CHAIN_ID`, `process.env['RH_CHAIN_ID']`, or a destructured `RH_CHAIN_ID` from `process.env`. */
const RAW_CHAIN_ID_READ = /process\.env(?:\.RH_CHAIN_ID\b|\[\s*['"`]RH_CHAIN_ID['"`]\s*\])|\{[^}]*\bRH_CHAIN_ID\b[^}]*\}\s*=\s*process\.env/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) sourceFiles(full, out);
    else if (SOURCE.test(name) && !TEST.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const files = ROOTS.map((root) => path.join(ROOT, root))
  .filter((dir) => existsSync(dir))
  .flatMap((dir) => sourceFiles(dir))
  .map((file) => ({ file: path.relative(ROOT, file).split(path.sep).join('/'), text: readFileSync(file, 'utf8') }));

const offenders = (pattern: RegExp, allowed: string) =>
  files.flatMap(({ file, text }) =>
    file === allowed ? [] : text.split('\n').flatMap((line, index) => (pattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
  );

describe('one chain-id constant (I15)', () => {
  it('reads a source tree worth checking', () => {
    expect(files.some(({ file }) => file === CONSTANT_HOME)).toBe(true);
    expect(files.length).toBeGreaterThan(20);
  });

  it('defines Robinhood Chain id as a literal only in constants.ts', () => {
    expect(offenders(CHAIN_LITERAL_DEFINITION, CONSTANT_HOME), 'import ROBINHOOD_CHAIN_ID from @hey/config/constants instead').toEqual([]);
  });

  it('reads RH_CHAIN_ID only through the config parser', () => {
    expect(offenders(RAW_CHAIN_ID_READ, ENV_HOME), 'read getServerEnv().chain.chainId instead').toEqual([]);
  });

  it('catches the shapes it guards', () => {
    expect(CHAIN_LITERAL_DEFINITION.test('export const PROOF_OF_SHIP_CHAIN_ID = 4663;')).toBe(true);
    expect(CHAIN_LITERAL_DEFINITION.test('const CHAIN: number = 4663;')).toBe(true);
    expect(CHAIN_LITERAL_DEFINITION.test('const CHAIN = 46630;')).toBe(false);
    expect(CHAIN_LITERAL_DEFINITION.test('const CHAIN = ROBINHOOD_CHAIN_ID;')).toBe(false);
    expect(RAW_CHAIN_ID_READ.test('const id = Number(process.env.RH_CHAIN_ID ?? 4663);')).toBe(true);
    expect(RAW_CHAIN_ID_READ.test("Number(process.env['RH_CHAIN_ID'])")).toBe(true);
    expect(RAW_CHAIN_ID_READ.test('const { RH_CHAIN_ID } = process.env;')).toBe(true);
    expect(RAW_CHAIN_ID_READ.test('chainId: raw.RH_CHAIN_ID,')).toBe(false);
  });
});
