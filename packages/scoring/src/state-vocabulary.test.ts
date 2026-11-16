import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { knownValuesByField, STATE_VOCABULARIES, stateVocabulary } from './state-vocabulary';

/**
 * The public state vocabularies (2026-11-13, state-machine audit): one declaration per machine a reader or an agent
 * meets, each held to the tables it reads, so a value added where it is decided cannot reach a surface without words.
 */
describe('the public state vocabularies', () => {
  it('names each machine once, with a stable kebab-case id', () => {
    const ids = STATE_VOCABULARIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]+$/);
    expect(stateVocabulary('activity-status')?.title).toBe('Activity status');
    expect(stateVocabulary('no-such-machine')).toBeUndefined();
  });

  it.each(STATE_VOCABULARIES.map((entry) => [entry.id, entry] as const))('%s: every value once, with words, and its unknowns among them', (_id, entry) => {
    expect(entry.codes.length).toBeGreaterThan(0);
    expect(new Set(entry.codes).size).toBe(entry.codes.length);
    for (const code of entry.notKnown) expect(entry.codes, code).toContain(code);
    for (const code of entry.codes) expect(entry.words(code).trim().length, `${entry.id}: ${code} has no words`).toBeGreaterThan(0);
    expect(entry.meaning.trim().length).toBeGreaterThan(0);
  });

  it('documents each public field once', () => {
    const fields = STATE_VOCABULARIES.flatMap((entry) => entry.fields);
    expect(new Set(fields).size).toBe(fields.length);
    for (const field of fields) expect(field).toMatch(/^[A-Z][A-Za-z]+\.[a-z][A-Za-z]+$/);
    expect(knownValuesByField().get('Project.activityStatus')).toEqual(stateVocabulary('activity-status')?.codes);
  });

  it('keeps the vocabularies that mean "not measured" from reading as a value', () => {
    // UNKNOWN activity, every withheld reason and an unread token check are unknowns: never zero, never a pass.
    expect(stateVocabulary('activity-status')?.notKnown).toEqual(['UNKNOWN']);
    expect(stateVocabulary('discovery-gap-withheld')?.notKnown).toEqual(stateVocabulary('discovery-gap-withheld')?.codes);
    expect(stateVocabulary('still-building-withheld')?.notKnown).toEqual(stateVocabulary('still-building-withheld')?.codes);
    expect(stateVocabulary('token-verification-reason')?.notKnown).toContain('not_checked');
  });

  it('reads only the word modules, so the MCP and the agent contract can bundle it', () => {
    const source = readFileSync(new URL('./state-vocabulary.ts', import.meta.url), 'utf8');
    const from = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    for (const module of from) {
      expect(['./activity-words', './market-status-words', './research-level-words', './verification-words', './withheld-words', './x-account-words'], module).toContain(module);
    }
  });
});
