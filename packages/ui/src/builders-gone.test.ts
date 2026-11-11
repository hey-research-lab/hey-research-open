import { describe, expect, it } from 'vitest';

import { cardBuildersGoneLine } from './project-card';
import { unknownActivityReason } from './status';

/* Rule B of 2026-11-11: the card's and the list row's short dated line. */
describe('cardBuildersGoneLine', () => {
  const now = new Date('2026-12-20T00:00:00Z');

  it('prints the short form when every builder source stopped answering, and nothing otherwise', () => {
    expect(cardBuildersGoneLine({ builderSourcesUnavailable: { since: '2026-12-03T09:00:00Z', sourceCount: 1, repositoriesOnly: true } }, now)).toBe(
      'Repository not answering since 3 Dec',
    );
    expect(cardBuildersGoneLine({}, now)).toBeNull();
  });

  it('gives the chip its reason beside UNKNOWN only', () => {
    const builderSourcesUnavailable = { since: '2026-12-03T09:00:00Z', sourceCount: 1, repositoriesOnly: true };
    expect(unknownActivityReason({ activityStatus: 'UNKNOWN', hasBuilderSource: false, builderSourcesUnavailable })).toBe('builder_sources_unavailable');
    expect(unknownActivityReason({ activityStatus: 'SHIPPING', hasBuilderSource: false, builderSourcesUnavailable })).toBeNull();
  });
});
