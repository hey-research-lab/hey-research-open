import { describe, expect, it } from 'vitest';

import { buildersGoneNotMeasured, deriveActivityStatus, type ScoredEvent } from './activity';
import { ACTIVITY } from './config';

/* Rule A of 2026-11-11 (hbm-v37, a private HEY record §4): building HEY can no longer read is not measured after 21 days. */
const now = new Date('2026-11-11T00:00:00Z');
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

const ship = (days: number, overrides: Partial<ScoredEvent> = {}): ScoredEvent => ({
  eventType: 'GITHUB_RELEASE',
  verificationStatus: 'PUBLICLY_VERIFIED',
  publishedAt: daysAgo(days),
  sourceKind: 'GITHUB',
  ...overrides,
});

const gone = (since: Date | null, events: ScoredEvent[]) =>
  deriveActivityStatus({ events, now, hasSourceCoverage: false, builderSourcesUnavailableSince: since });

describe('every builder source unavailable (hbm-v37)', () => {
  it('waits 21 days', () => {
    expect(ACTIVITY.buildersGoneNotMeasuredDays).toBe(21);
  });

  it('is UNKNOWN with its reason once the last source has been dark 21 days and nothing counted is dated since', () => {
    const result = gone(daysAgo(21), [ship(25), ship(30)]);
    expect(result.status).toBe('UNKNOWN');
    expect(result.unknownReason).toBe('builder_sources_unavailable');
    // The last ship still renders: the ships counted before stay on the record.
    expect(result.lastMeaningfulShipAt).toEqual(daysAgo(25));
    expect(result.meaningfulEventCount).toBe(2);
    expect(result.reason).not.toMatch(/\b(rug|scam|exit|abandoned|private|dead)\b/i);
  });

  it('holds the status the ships give at 20 days', () => {
    const result = gone(daysAgo(20), [ship(25), ship(30)]);
    expect(result.status).toBe('ACTIVE');
    expect(result.unknownReason).toBeUndefined();
  });

  it('keeps the status computed as before when a counted ship is dated on or after the day the last source went dark', () => {
    // A contract deploy dated after the repository went dark: building HEY still reads elsewhere.
    expect(gone(daysAgo(30), [ship(10, { eventType: 'CONTRACT_DEPLOY_FOLLOWUP', sourceKind: 'CONTRACT' }), ship(40)]).status).toBe('ACTIVE');
    expect(gone(daysAgo(30), [ship(30), ship(40)]).status).toBe('ACTIVE');
  });

  it('counts only a counted ship: an announcement dated since does not hold the status', () => {
    expect(gone(daysAgo(30), [ship(5, { eventType: 'ANNOUNCEMENT' }), ship(35), ship(40)]).status).toBe('UNKNOWN');
  });

  it('is cleared by a source answering again (no date), and never reads DORMANT', () => {
    expect(gone(null, [ship(25), ship(30)]).status).toBe('ACTIVE');
    expect(gone(daysAgo(90), [ship(120)]).status).toBe('UNKNOWN');
    expect(gone(daysAgo(90), []).status).toBe('UNKNOWN');
    expect(gone(daysAgo(90), []).unknownReason).toBe('builder_sources_unavailable');
    expect(buildersGoneNotMeasured(undefined, [], now)).toBe(false);
    expect(buildersGoneNotMeasured(new Date(Number.NaN), [], now)).toBe(false);
  });
});
