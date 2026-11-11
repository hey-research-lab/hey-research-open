import { describe, expect, it } from 'vitest';

import { activityPresentation, BUILDER_SOURCES_STOPPED, builderSourcesGoneLine, projectActivityWords, unknownActivityReason } from './activity-words';

/* Rule B of 2026-11-11 (a private HEY record §3): one dated line, what HEY read and when. */
const since = '2026-12-03T09:00:00Z';
const now = new Date('2026-12-20T00:00:00Z');

describe('builderSourcesGoneLine', () => {
  it('says the day the repository stopped answering', () => {
    expect(builderSourcesGoneLine({ gone: { since, sourceCount: 1, repositoriesOnly: true } })).toBe(
      'HEY cannot read this project’s building: its repository stopped answering on 3 Dec 2026.',
    );
    expect(builderSourcesGoneLine({ gone: { since: new Date(since), sourceCount: 2, repositoriesOnly: false } })).toBe(
      'HEY cannot read this project’s building: its 2 builder sources stopped answering, the last on 3 Dec 2026.',
    );
  });

  it('adds the liquidity fact in the market’s own words only when the market says it is gone', () => {
    const gone = { since, sourceCount: 1, repositoriesOnly: true };
    expect(builderSourcesGoneLine({ gone, market: { status: 'LIQUIDITY_REMOVED', since: '2026-12-05T12:00:00Z' } })).toBe(
      'HEY cannot read this project’s building: its repository stopped answering on 3 Dec 2026. Liquidity no longer detected since 5 Dec 2026.',
    );
    expect(builderSourcesGoneLine({ gone, market: { status: 'NO_LIQUIDITY', since: null } })).toBe(
      'HEY cannot read this project’s building: its repository stopped answering on 3 Dec 2026. No liquidity detected.',
    );
    for (const status of ['ACTIVE_MARKET', 'LOW_LIQUIDITY', 'TRADING_INACTIVE', 'INSUFFICIENT_DATA', null]) {
      expect(builderSourcesGoneLine({ gone, market: { status, since: '2026-12-05T12:00:00Z' } })).not.toMatch(/liquidity/i);
    }
  });

  it('has a short form for the card and the list row', () => {
    expect(builderSourcesGoneLine({ gone: { since, sourceCount: 1, repositoriesOnly: true }, form: 'short', now })).toBe('Repository not answering since 3 Dec');
    expect(builderSourcesGoneLine({ gone: { since, sourceCount: 3, repositoriesOnly: true }, form: 'short', now: new Date('2027-01-04T00:00:00Z') })).toBe(
      '3 repositories not answering since 3 Dec 2026',
    );
    expect(builderSourcesGoneLine({ gone: { since, sourceCount: 1 }, form: 'short', now })).toBe('Builder source not answering since 3 Dec');
  });

  it('prints nothing for a date that does not parse', () => {
    expect(builderSourcesGoneLine({ gone: { since: 'not a date', sourceCount: 1 } })).toBeNull();
    expect(builderSourcesGoneLine({ gone: { since: 'not a date', sourceCount: 1 }, form: 'short' })).toBeNull();
  });

  it('never says why: no rug, scam, exit, abandoned, private or dead in any form', () => {
    const banned = /\b(rug|rugged|rugpull|scam|exit|abandoned|private|dead)\b/i;
    const lines: (string | null)[] = [];
    for (const sourceCount of [1, 2, 5]) {
      for (const repositoriesOnly of [true, false]) {
        for (const status of ['LIQUIDITY_REMOVED', 'NO_LIQUIDITY', 'ACTIVE_MARKET', null]) {
          for (const form of ['full', 'short'] as const) {
            lines.push(builderSourcesGoneLine({ gone: { since, sourceCount, repositoriesOnly }, form, market: { status, since: '2026-12-05' }, now }));
          }
        }
      }
    }
    lines.push(BUILDER_SOURCES_STOPPED.label, BUILDER_SOURCES_STOPPED.help);
    for (const line of lines) expect(line ?? '').not.toMatch(banned);
  });
});

describe('the UNKNOWN reason builder_sources_unavailable', () => {
  it('names the stopped sources ahead of every other reason, and only beside UNKNOWN', () => {
    const gone = { since, sourceCount: 1, repositoriesOnly: true };
    expect(unknownActivityReason({ activityStatus: 'UNKNOWN', builderSourcesUnavailable: gone })).toBe('builder_sources_unavailable');
    expect(unknownActivityReason({ activityStatus: 'UNKNOWN', hasBuilderSource: false, lastMeaningfulShipAt: new Date(), builderSourcesUnavailable: gone })).toBe('builder_sources_unavailable');
    expect(unknownActivityReason({ activityStatus: 'ACTIVE', builderSourcesUnavailable: gone })).toBeNull();
    expect(unknownActivityReason({ activityStatus: 'UNKNOWN', hasBuilderSource: false, lastMeaningfulShipAt: new Date(), builderSourcesUnavailable: null })).toBe('no_readable_source');
    expect(activityPresentation('UNKNOWN', 'builder_sources_unavailable')).toEqual(BUILDER_SOURCES_STOPPED);
    expect(projectActivityWords({ activityStatus: 'UNKNOWN', builderSourcesUnavailable: gone }).label).toBe('Not measured — builder sources stopped answering');
  });
});
