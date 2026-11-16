import { describe, expect, it } from 'vitest';

import * as fx from './fixtures/api';
import { renderCompare } from './render';
import { renderSnapshot } from './render-machine';

/**
 * The MCP prints "Verified Builder" by the page's one rule (state-machine audit 2026-11-13, surfaces gap 2):
 * `showsVerifiedBuilder` — the scorer's research level and the catalogue both say VERIFIED_BUILDER — and never the
 * retired "Indexed" or "Researched" words (UI rule 4, R6). The API's fields are read as sent (machine rule 10).
 */
const NOW = new Date('2026-09-25T20:00:00Z');
const DISAGREE = [
  { researchLevel: 'VERIFIED_BUILDER', catalogStatus: 'QUALIFIED' },
  { researchLevel: 'RESEARCHED', catalogStatus: 'VERIFIED_BUILDER' },
] as const;

describe('the MCP draws the Verified Builder badge only where both columns agree', () => {
  it('the snapshot says yes or no, never a research level', () => {
    expect(renderSnapshot(fx.snapshot, NOW)).toContain('- DERIVED Verified Builder: yes; kind: utility');
    for (const levels of DISAGREE) {
      const text = renderSnapshot({ ...fx.snapshot, identity: { ...fx.snapshot.identity, ...levels } }, NOW);
      expect(text, JSON.stringify(levels)).toContain('- DERIVED Verified Builder: no; kind: utility');
      expect(text).not.toMatch(/research level|catalogue: |\bResearched\b|\bresearched;|\bIndexed\b/);
    }
  });

  it('compare reads the API’s verifiedBuilder beside its researchLevel', () => {
    const [agentos] = fx.compare.projects;
    const page = (over: Partial<typeof agentos>) => ({ ...fx.compare, projects: [{ ...agentos!, ...over }] });
    expect(renderCompare(page({}))).toContain('FACT Verified Builder: yes;');
    expect(renderCompare(page({ researchLevel: 'RESEARCHED' }))).toContain('FACT Verified Builder: no;');
    expect(renderCompare(page({ verifiedBuilder: false }))).toContain('FACT Verified Builder: no;');
  });
});
