import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { AUTOMATION, commitSubjectTemplate, detectAutomatedCommits, onRegularClock, type ListedCommitSubject } from './commit-automation';

/**
 * Automated commit streams (commit-substance-v3, 2026-10-02). The fixtures
 * are the real repositories the outsider audit found leading the ships feed,
 * read from GitHub's public API: subjects and dates only.
 */
type Fixture = Record<string, { sha: string; message: string; committedAt: string }[]>;
const fixture = JSON.parse(readFileSync(new URL('./fixtures/commit-streams.json', import.meta.url), 'utf8')) as Fixture;
const listing = (key: string): ListedCommitSubject[] =>
  (fixture[key] ?? []).map((row) => ({ sha: row.sha, message: row.message, committedAt: new Date(row.committedAt) }));

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, 0) + minutes * 60_000);
/** `count` instants inside one ISO week (from Monday 2026-09-28) whose gaps follow no clock. */
const irregular = (count: number): Date[] => {
  const gaps = [3, 90, 11, 240, 45, 7, 400];
  let minute = -3 * 1440;
  return Array.from({ length: count }, (_, index) => at((minute += gaps[index % gaps.length]!)));
};

describe('detectAutomatedCommits — the audit repositories', () => {
  it('names a script posting the same stats line every 25 minutes (SOL_RH)', () => {
    const commits = listing('sol_rh_stats_stream');
    const { automated, streams } = detectAutomatedCommits(commits);
    expect(automated.size).toBe(commits.length);
    expect(streams[0]).toMatchObject({ template: 'stats: <n> bnb distributed', regular: true });
  });

  it('names a bot writing its own timestamp into every message (brodie-terminal "refresh ledgers")', () => {
    const commits = listing('brodie_terminal_ledgers');
    const { automated, streams } = detectAutomatedCommits(commits);
    // The bot's 31 refreshes are named; the team's 9 hand-written commits between them are not.
    const refreshes = commits.filter((commit) => commit.message.startsWith('chore: refresh ledgers'));
    expect(refreshes.length).toBe(31);
    expect([...automated.keys()].sort()).toEqual(refreshes.map((commit) => commit.sha).sort());
    expect(streams[0]).toMatchObject({ template: 'chore: refresh ledgers <time>', varying: 'timestamp' });
  });

  it('leaves a person editing one file by hand at irregular times alone ("Update worker.js")', () => {
    const { automated } = detectAutomatedCommits(listing('meme_hunter_web_edits'));
    expect(automated.size).toBe(0);
  });

  it('leaves varied, hand-written subjects alone, whoever typed them (robinhood-chain-alpha)', () => {
    const { automated } = detectAutomatedCommits(listing('chain_alpha_agent_commits'));
    expect(automated.size).toBe(0);
  });
});

describe('detectAutomatedCommits — a stream by its rate (2026-11-09, data-trust audit lane B finding 3)', () => {
  it('names "Mevy strategy research: progress-<N>": one changing counter, an irregular clock, 100 commits in three days', () => {
    const commits = listing('mevy_progress_stream');
    const progress = commits.filter((commit) => commit.message.startsWith('Mevy strategy research: progress-'));
    // The v3 rules alone miss it: no regular clock, one varying number.
    expect(onRegularClock(progress.map((commit) => commit.committedAt))).toBe(false);
    expect(detectAutomatedCommits(commits, { rate: false }).automated.size).toBe(0);
    const { automated, streams } = detectAutomatedCommits(commits);
    for (const commit of progress) expect(automated.get(commit.sha), commit.message).toBe('automated_stream');
    expect(streams).toContainEqual(expect.objectContaining({ template: 'mevy strategy research: progress<n>', regular: false, varying: 'none', rate: true }));
  });

  it('names a mirror re-committing "Updated on <date>" dozens of times a day, the date the same in every subject', () => {
    const commits = listing('tangem_updated_on');
    expect(new Set(commits.map((commit) => commit.message)).size).toBe(1);
    expect(detectAutomatedCommits(commits, { rate: false }).automated.size).toBe(0);
    const { automated, streams } = detectAutomatedCommits(commits);
    expect(automated.size).toBe(commits.length);
    expect(streams[0]).toMatchObject({ template: 'updated on <time>', rate: true });
  });

  it('reads HEY\'s own "Open-source sync (<hash>)" commits by the same rule (agent-discovery rule 2)', () => {
    const commits = listing('hey_open_sync');
    const { automated, streams } = detectAutomatedCommits(commits);
    // 100 sync commits from 11 Oct to 8 Nov 2026 under two wordings, each at least four a day on three days of one week.
    // The two whose short hash happens to be all digits template as `(<n>)`, a group of two, and stay as they are.
    const hexSyncs = commits.filter((commit) => commitSubjectTemplate(commit.message).endsWith('(<hex>)'));
    expect(hexSyncs.length).toBe(98);
    for (const commit of hexSyncs) expect(automated.get(commit.sha), commit.message).toBe('automated_stream');
    expect(streams).toContainEqual(expect.objectContaining({ template: 'open-source sync (<hex>)', rate: true }));
    expect(streams).toContainEqual(expect.objectContaining({ template: 'sync from hey research lab (<hex>)', rate: true }));
  });

  it('a person\'s numbered fixes stay hand work, even many in a day', () => {
    const fixes = [3, 41, 47, 190, 260, 600, 610].map((minute, index) => ({ sha: `f${index}`, message: `fix #${12 + index * 7}`, committedAt: at(minute) }));
    expect(detectAutomatedCommits(fixes).automated.size).toBe(0);
    // Two days of four "fix #N" each: under the rate (three such days, or fifty in a week).
    const twoDays = [3, 41, 190, 600, 1450, 1460, 1790, 2300].map((minute, index) => ({ sha: `g${index}`, message: `fix #${100 + index}`, committedAt: at(minute) }));
    expect(detectAutomatedCommits(twoDays).automated.size).toBe(0);
  });

  it('a subject with no placeholder is never a stream by rate, however often a person commits it', () => {
    const edits = irregular(60).map((committedAt, index) => ({ sha: `u${index}`, message: 'Update worker.js', committedAt }));
    expect(onRegularClock(edits.map((edit) => edit.committedAt))).toBe(false);
    expect(detectAutomatedCommits(edits).automated.size).toBe(0);
  });

  it('a fixed number in every subject is part of the words, not a stamp', () => {
    const docs = irregular(60).map((committedAt, index) => ({ sha: `d${index}`, message: 'Update v2 docs', committedAt }));
    expect(detectAutomatedCommits(docs).automated.size).toBe(0);
  });

  it('counts the rate inside one ISO week: four a day on three days, or fifty in the week', () => {
    const day = (d: number, minute: number) => new Date(Date.UTC(2026, 9, 26 + d, 0, minute));
    const threeDays = [0, 1, 2].flatMap((d) => [5, 97, 300, 811].map((minute, index) => ({ sha: `t${d}${index}`, message: `progress-${d * 10 + index}`, committedAt: day(d, minute) })));
    expect(detectAutomatedCommits(threeDays).automated.size).toBe(12);
    // The same twelve split across two ISO weeks (Sunday and Monday): no week holds three such days.
    const split = [0, 6, 7].flatMap((d) => [5, 97, 300, 811].map((minute, index) => ({ sha: `s${d}${index}`, message: `progress-${d * 10 + index}`, committedAt: day(d, minute) })));
    expect(detectAutomatedCommits(split).automated.size).toBe(0);
  });
});

describe('detectAutomatedCommits — the rules', () => {
  it('needs at least minRepeats commits of one template', () => {
    const few = Array.from({ length: AUTOMATION.minRepeats - 1 }, (_, index) => ({ sha: `a${index}`, message: 'sync prices', committedAt: at(index * 30) }));
    expect(detectAutomatedCommits(few).automated.size).toBe(0);
    const enough = Array.from({ length: AUTOMATION.minRepeats }, (_, index) => ({ sha: `b${index}`, message: 'sync prices', committedAt: at(index * 30) }));
    expect(detectAutomatedCommits(enough).automated.size).toBe(AUTOMATION.minRepeats);
  });

  it('a person\'s numbered fixes are not a stream: one varying number and no clock', () => {
    const fixes = [3, 41, 47, 190, 260, 600, 610].map((minute, index) => ({ sha: `f${index}`, message: `fix #${12 + index * 7}`, committedAt: at(minute) }));
    expect(detectAutomatedCommits(fixes).automated.size).toBe(0);
  });

  it('two changing figures in the subject read as a script\'s output even off the clock', () => {
    const sells = [3, 41, 47, 190, 260, 600, 610].map((minute, index) => ({ sha: `s${index}`, message: `sell ${1000 + index * 37} TOKEN for ${(0.01 * (index + 1)).toFixed(3)} ETH`, committedAt: at(minute) }));
    expect(detectAutomatedCommits(sells).automated.size).toBe(7);
  });

  it('names a subject only automation writes, one by one', () => {
    const { automated } = detectAutomatedCommits([{ sha: 'x1', message: '[bot] update feed', committedAt: at(0) }, { sha: 'x2', message: 'Auto-update prices', committedAt: at(5) }, { sha: 'x3', message: 'feat: add pool', committedAt: at(9) }]);
    expect([...automated.keys()].sort()).toEqual(['x1', 'x2']);
  });

  it('a template of placeholders alone says nothing', () => {
    const numbers = Array.from({ length: 8 }, (_, index) => ({ sha: `n${index}`, message: `${index}.${index}`, committedAt: at(index * 10) }));
    expect(detectAutomatedCommits(numbers).automated.size).toBe(0);
  });
});

describe('commitSubjectTemplate and onRegularClock', () => {
  it('sets aside timestamps, hashes, addresses and numbers', () => {
    expect(commitSubjectTemplate('chore: refresh ledgers 2026-10-01T17:09:57Z')).toBe('chore: refresh ledgers <time>');
    expect(commitSubjectTemplate('Deploy 0xAbCdEf0123456789 at 9f3c2a1b')).toBe('deploy <hex> at <hex>');
    expect(commitSubjectTemplate('stats: 7.80609407393365932 BNB distributed')).toBe('stats: <n> bnb distributed');
  });

  it('reads a clock from the gaps, not from the count', () => {
    expect(onRegularClock(Array.from({ length: 8 }, (_, index) => at(index * 25)))).toBe(true);
    expect(onRegularClock([0, 2, 50, 51, 300, 302, 900, 1500].map(at))).toBe(false);
  });
});
