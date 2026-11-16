import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { projectActivityWords, unknownActivityReason } from './activity-words';

/**
 * The activity words read one set of facts (`ActivityReadFacts`; 2026-11-12 state-machine audit, F2). Six readers
 * re-picked two or three of them into an object literal — `unknownActivityReason({ activityStatus, hasBuilderSource,
 * lastMeaningfulShipAt })` — and so dropped `builderSourcesUnavailable` when Rule B added it (2026-11-11): their chips
 * kept the reasons before it. A caller hands the facts whole (a card, a profile, a row read through
 * `activityReadFactsSql`, or a spread of one); a literal that names `hasBuilderSource:` itself is the re-pick, and
 * this test fails on one.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TREES = [
  'apps/web/src',
  'packages/domain/src',
  'packages/ui/src',
  'packages/mcp-core/src',
  'packages/agent-provider-core/src',
];
const CALLEES = ['unknownActivityReason', 'projectActivityWords'];

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** The argument text of each `callee({ … })` call: the balanced braces after the parenthesis. */
function literalArguments(source: string, callee: string): string[] {
  const found: string[] = [];
  const opener = `${callee}({`;
  for (
    let at = source.indexOf(opener);
    at !== -1;
    at = source.indexOf(opener, at + opener.length)
  ) {
    let depth = 0;
    const start = at + callee.length + 1;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          found.push(source.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return found;
}

describe('the activity words read the facts whole', () => {
  it('no caller re-picks the source facts into a literal', () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const tree of TREES) {
      for (const file of sourceFiles(join(ROOT, tree))) {
        scanned += 1;
        const source = readFileSync(file, 'utf8');
        for (const callee of CALLEES) {
          for (const literal of literalArguments(source, callee)) {
            if (/\bhasBuilderSource\s*:/.test(literal))
              offenders.push(
                `${file.slice(ROOT.length)}: ${callee}(${literal.replace(/\s+/g, ' ')})`,
              );
          }
        }
      }
    }
    // The scan reached the trees (a moved root would pass on nothing). The public export carries `packages/` and not
    // `apps/web` (as `no-emoji.test.ts` reads it), so there the floor is the packages' own files.
    expect(scanned).toBeGreaterThan(existsSync(join(ROOT, 'apps/web')) ? 500 : 50);
    expect(offenders).toEqual([]);
  });

  it('a project whose every builder source stopped answering reads that reason, whatever else the facts say', () => {
    const gone = { since: '2026-10-01T00:00:00.000Z', sourceCount: 2, repositoriesOnly: false };
    for (const hasBuilderSource of [false, undefined]) {
      expect(
        unknownActivityReason({
          activityStatus: 'UNKNOWN',
          hasBuilderSource,
          builderSourcesUnavailable: gone,
        }),
      ).toBe('builder_sources_unavailable');
    }
    expect(
      projectActivityWords({ activityStatus: 'UNKNOWN', builderSourcesUnavailable: gone }).label,
    ).toBe('Not measured — builder sources stopped answering');
    // A fact the reader does not hold is absent, and the words stay the plain status word rather than guess.
    expect(unknownActivityReason({ activityStatus: 'UNKNOWN' })).toBeNull();
  });
});
