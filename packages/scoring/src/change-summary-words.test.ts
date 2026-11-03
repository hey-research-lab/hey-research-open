import { describe, expect, it } from 'vitest';

import { changeSummaryWords } from './verification-words';

/** The ledger's own stored sentences (`transitionSentence`, `claimCandidates`, `abiCandidates` in @hey/domain). */
describe('changeSummaryWords (2026-10-30 UI audit, R2)', () => {
  it('reads a builder standing move as the badge, never "Research standing" or "Published"', () => {
    expect(changeSummaryWords('Research standing moved from Published to Verified builder')).toBe('Became a Verified Builder');
    expect(changeSummaryWords('Research standing moved from Not published to Verified builder')).toBe('Became a Verified Builder');
    expect(changeSummaryWords('Research standing moved from Verified builder to Published')).toBe('No longer a Verified Builder');
    expect(changeSummaryWords('Research standing moved from Not published to Published')).toBe('Project page published');
    expect(changeSummaryWords('Research standing moved from Published to Not published')).toBe('Project page no longer published');
    expect(changeSummaryWords('Project page published (Verified builder)')).toBe('Project page published as a Verified Builder');
  });

  it('reads a token check in the token words every other surface prints', () => {
    expect(changeSummaryWords('Token verification moved from Unverified to Verified')).toBe('Token check: now “Project names this contract” (was “Not named by the project”)');
    expect(changeSummaryWords('Token verification moved from Verified to Site names another contract')).toBe(
      'Token check: now “Project names another contract” (was “Project names this contract”)',
    );
    expect(changeSummaryWords('Token verification: Verified')).toBe('Token check: “Project names this contract”');
  });

  it('reads an ownership claim and an explorer source without the word', () => {
    expect(changeSummaryWords('Verified owner (GitHub)')).toBe('Owner proved control (GitHub)');
    expect(changeSummaryWords('Contract 0xab…cd12 source verified on the explorer')).toBe('Contract 0xab…cd12 source published on the explorer');
    expect(changeSummaryWords('Contract 0xab…cd12 no longer shown as verified on the explorer')).toBe('Contract 0xab…cd12 source no longer shown on the explorer');
  });

  it('leaves every other summary as stored', () => {
    for (const summary of ['Released v1.2.0', 'Activity status moved from Quiet to Shipping', 'Verified the fix for issue #12 in v2', 'Official source added: website']) {
      expect(changeSummaryWords(summary)).toBe(summary);
    }
  });

  it('never leaves "verified" in a summary it rewrote', () => {
    const stored = [
      'Research standing moved from Published to Verified builder',
      'Project page published (Verified builder)',
      'Token verification moved from Unverified to Verified',
      'Token verification: Unverified',
      'Verified owner (domain record)',
      'Contract 0x1 source verified on the explorer',
      'Contract 0x1 no longer shown as verified on the explorer',
    ];
    for (const summary of stored) expect(changeSummaryWords(summary).replace(/Verified Builders?/g, '')).not.toMatch(/verif/i);
  });
});
