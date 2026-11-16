import { describe, expect, it } from 'vitest';

import { buildMomentumWithheldOf, momentumMeasured, publishedBuildMomentum } from './momentum';
import { BUILD_MOMENTUM_WITHHELD_REASONS, BUILD_MOMENTUM_WITHHELD_WORDS, buildMomentumWithheldReason } from './withheld-words';

describe('momentumMeasured', () => {
  it('counts a positive score as measured on a status HEY measures', () => {
    expect(momentumMeasured({ score: { hbm: 12 }, activityResearched: false, activityStatus: 'QUIET' })).toBe(true);
    expect(momentumMeasured({ score: { hbm: 12 }, activityResearched: true, activityStatus: 'SHIPPING' })).toBe(true);
  });

  it('keeps a researched zero on a readable, quiet project', () => {
    expect(momentumMeasured({ score: { hbm: 0 }, activityResearched: true, activityStatus: 'DORMANT' })).toBe(true);
  });

  it('does not print a zero for a project HEY found nothing readable for (A10-12, 2026-09-25)', () => {
    expect(momentumMeasured({ score: { hbm: 0 }, activityResearched: true, activityStatus: 'UNKNOWN' })).toBe(false);
    expect(momentumMeasured({ score: { hbm: 0 }, activityResearched: false, activityStatus: 'QUIET' })).toBe(false);
    expect(momentumMeasured({ score: undefined, activityResearched: true, activityStatus: 'SHIPPING' })).toBe(false);
  });

  it('never shows a positive score beside an UNKNOWN status (founder, 2026-11-15: /project/pingapp, "Build Momentum 26")', () => {
    expect(momentumMeasured({ score: { hbm: 26 }, activityResearched: true, activityStatus: 'UNKNOWN' })).toBe(false);
    expect(momentumMeasured({ score: { hbm: 12 }, activityResearched: false, activityStatus: 'UNKNOWN' })).toBe(false);
  });
});

describe('buildMomentumWithheldOf', () => {
  it('names why: activity unknown, builder sources gone, unresearched zero, no score', () => {
    expect(buildMomentumWithheldOf({ score: { hbm: 26 }, activityResearched: true, activityStatus: 'UNKNOWN' })).toBe('activity_unknown');
    expect(
      buildMomentumWithheldOf({ score: { hbm: 26, components: { activityUnknownReason: 'builder_sources_unavailable' } }, activityResearched: true, activityStatus: 'UNKNOWN' }),
    ).toBe('builder_sources_unavailable');
    expect(buildMomentumWithheldOf({ score: { hbm: 0 }, activityResearched: false, activityStatus: 'QUIET' })).toBe('not_researched');
    expect(buildMomentumWithheldOf({ score: undefined, activityResearched: true, activityStatus: 'ACTIVE' })).toBe('not_scored');
    expect(buildMomentumWithheldOf({ score: { hbm: 40 }, activityResearched: true, activityStatus: 'SHIPPING' })).toBeUndefined();
  });

  it('agrees with momentumMeasured on every case: the figure shown is the figure measured', () => {
    const statuses = ['SHIPPING', 'ACTIVE', 'QUIET', 'DORMANT', 'UNKNOWN', undefined];
    for (const activityStatus of statuses)
      for (const hbm of [undefined, 0, 0.4, 26, 100])
        for (const activityResearched of [true, false]) {
          const profile = { score: hbm === undefined ? undefined : { hbm }, activityResearched, activityStatus };
          const published = publishedBuildMomentum(profile);
          expect(momentumMeasured(profile)).toBe(buildMomentumWithheldOf(profile) === undefined);
          expect(published.value === null).toBe(!momentumMeasured(profile));
          if (published.value === null) expect(published.withheld).toBeDefined();
          if (activityStatus === 'UNKNOWN') expect(published.value).toBeNull();
        }
  });

  it('has words for every reason, and reads only its own reasons back', () => {
    for (const reason of BUILD_MOMENTUM_WITHHELD_REASONS) {
      expect(BUILD_MOMENTUM_WITHHELD_WORDS[reason]).toMatch(/^Not measured — /);
      expect(buildMomentumWithheldReason(reason)).toBe(reason);
    }
    expect(buildMomentumWithheldReason('market_too_thin')).toBeUndefined();
  });
});
