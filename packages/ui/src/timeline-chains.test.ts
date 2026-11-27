import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it } from 'vitest';

import { BuildTimeline, shapeTimeline, type TimelineBreak, type TimelineItem } from './timeline';

/**
 * A page on more than one chain (multichain WP3.2; the UX-0 sign-off of 17 Nov): each timeline item may carry its chain's
 * chip and a tag, a ship already on record before HEY tracked its chain is quieter, and one break line marks where the
 * tracking began. A page on one chain sets none of it, so its timeline renders exactly as before.
 */
const NOW = new Date('2026-12-18T10:00:00Z');
const BASE = { id: 8453, label: 'Base', icon: '/brand/chains/base.svg' };
const HOME = { id: 4663, label: 'Robinhood Chain', icon: '/brand/chains/robinhood-chain.png' };
const ship = (id: string, at: string, extra: Partial<TimelineItem> = {}): TimelineItem => ({
  id,
  title: `Ship ${id}`,
  eventType: 'GITHUB_RELEASE',
  publishedAt: new Date(at),
  verificationStatus: 'PUBLICLY_VERIFIED',
  ...extra,
});
const brk: TimelineBreak = { kind: 'tracking_began', id: 'tracking-8453', line: 'HEY began tracking Example Labs on Base on 9 Dec 2026.' };

describe('BuildTimeline on a page on more than one chain', () => {
  it('draws each item’s chips and tags, and the break line once', () => {
    const markup = renderToStaticMarkup(
      createElement(BuildTimeline, {
        now: NOW,
        items: [
          ship('a', '2026-12-16T10:00:00Z', { chains: [HOME, BASE], tags: [{ label: 'Counted once', help: 'Counts once.' }] }),
          brk,
          ship('b', '2026-11-28T10:00:00Z', { eventType: 'CONTRACT_DEPLOY', chains: [BASE], tags: [{ label: 'Not in What changed' }], muted: true }),
        ],
      }),
    );
    expect(markup.match(/data-testid="timeline-chains"/g)).toHaveLength(2);
    expect(markup.match(/data-testid="chain-chip"/g)).toHaveLength(3);
    expect(markup).toContain('Counted once');
    expect(markup).toContain('title="Counts once."');
    expect(markup).toContain('Not in What changed');
    expect(markup.match(/data-testid="timeline-tracking-began"/g)).toHaveLength(1);
    expect(markup).toContain('data-muted="true"');
  });

  it('draws nothing new for items that carry no chain: the one-chain timeline is unchanged', () => {
    const items = [ship('a', '2026-12-16T10:00:00Z'), ship('b', '2026-12-10T10:00:00Z')];
    const markup = renderToStaticMarkup(createElement(BuildTimeline, { now: NOW, items }));
    expect(markup).not.toMatch(/timeline-chains|chain-chip|timeline-tag|timeline-tracking-began|data-muted/);
  });

  it('counts a break toward no limit and never in "Earlier ships"', () => {
    const items = [ship('a', '2026-12-16T10:00:00Z'), brk, ship('b', '2026-11-28T10:00:00Z'), ship('c', '2026-11-20T10:00:00Z')];
    const { shown, earlier, earlierCount } = shapeTimeline(items, 2);
    expect(shown.map((entry) => entry.id)).toEqual(['a', 'tracking-8453', 'b']);
    expect(earlier.map((entry) => entry.id)).toEqual(['c']);
    expect(earlierCount).toBe(1);
    // A break at the cut stays with the ships it heads.
    const atCut = shapeTimeline([ship('a', '2026-12-16T10:00:00Z'), brk, ship('b', '2026-11-28T10:00:00Z')], 1);
    expect(atCut.shown.map((entry) => entry.id)).toEqual(['a']);
    expect(atCut.earlier.map((entry) => entry.id)).toEqual(['tracking-8453', 'b']);
    expect(atCut.earlierCount).toBe(1);
  });
});
