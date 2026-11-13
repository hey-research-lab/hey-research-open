import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NotTrackedCard, NotTrackedChip, NotTrackedListRow, notTrackedAnswer, type NotTrackedProject } from './not-tracked';
import { PROJECT_LIST_COLUMNS, ProjectList } from './project-list';
import { notObservedShipWeeks, shipWeeksSentence } from './ship-weeks';
import { ActivityChip } from './status';

/*
 * The not-tracked row and card (2026-11-13: the Base preview drawn as the builder list): the list's own cells and the
 * card's own shell, with "Not measured" in the status chip, a "not observed" chart and empty token and value cells —
 * never a measured status, a zero, a token check or a figure.
 */
const NOW = new Date('2026-11-13T12:00:00Z');

const base: NotTrackedProject = {
  slug: 'beefy',
  name: 'Beefy',
  href: '/base/beefy',
  logoUrl: null,
  subline: 'DeFi',
  note: 'On Base: Contract source published',
  description: 'Yield optimizer.',
  notMeasured: { reason: 'Base tracking starts in December', help: 'HEY does not track Base yet.' },
  latestShip: { title: 'Two new vaults', href: 'https://github.com/beefyfinance/x?utm_source=heyresearch', at: '2026-11-12', when: '1 day ago', day: '12 Nov 2026' },
  weeks: notObservedShipWeeks(NOW),
  foot: { left: 'On Base: Contract source published', right: 'beefy.com' },
};

describe('notObservedShipWeeks', () => {
  it('is eight UTC ISO weeks keyed by their Monday, ending with this week, none observed', () => {
    const series = notObservedShipWeeks(NOW);
    expect(series.weeks.map((week) => week.week)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
    expect(series.weeks.every((week) => week.ships === null)).toBe(true);
    expect(series).toMatchObject({ total: 0, observed: 0 });
    expect(shipWeeksSentence(series)).toMatch(/^Not observed/);
    // A Monday is its own week; a Sunday belongs to the week before.
    expect(notObservedShipWeeks(new Date('2026-11-09T00:00:00Z'), 1).weeks[0]!.week).toBe('2026-11-09');
    expect(notObservedShipWeeks(new Date('2026-11-08T23:59:59Z'), 1).weeks[0]!.week).toBe('2026-11-02');
  });
});

describe('the status chip, not tracked', () => {
  it('reads "Not measured" with the reason, titled by the caller, as UNKNOWN', () => {
    const html = renderToStaticMarkup(createElement(NotTrackedChip, base.notMeasured));
    expect(html).toContain('data-activity-status="UNKNOWN"');
    expect(html).toContain('Not measured');
    expect(html).toContain('Base tracking starts in December');
    expect(html).toContain('title="HEY does not track Base yet."');
    expect(html).not.toContain('data-unknown-reason');
    expect(notTrackedAnswer('x')).toBe('Not measured — x');
  });

  it('an ActivityChip without `help` keeps the status’s own title', () => {
    const plain = renderToStaticMarkup(createElement(ActivityChip, { status: 'SHIPPING' }));
    const titled = renderToStaticMarkup(createElement(ActivityChip, { status: 'SHIPPING', help: 'Custom.' }));
    expect(plain).not.toContain('title="Custom."');
    expect(plain).toMatch(/title="[^"]+"/);
    expect(titled).toContain('title="Custom."');
  });
});

describe('a not-tracked list row', () => {
  const html = renderToStaticMarkup(createElement(ProjectList, { caption: 'Base builders', withPreview: false, children: createElement(NotTrackedListRow, { project: base }) }));

  it('draws the builder list’s columns, Preview aside, with the name as the one HEY link', () => {
    for (const column of PROJECT_LIST_COLUMNS.filter((column) => column !== 'Preview')) expect(html).toContain(`>${column === '8 weeks' ? '<span title="Counted ships per week, the last 8 weeks">8 weeks</span>' : column}<`);
    expect(html).toContain('href="/base/beefy" class="v2-row-link"');
    expect(html).not.toContain('/project/');
    expect(html).toContain('data-tracked="false"');
  });

  it('says not measured, draws a not-observed chart, and leaves the token check and value cells empty', () => {
    expect(html).toContain('Not measured');
    expect(html).toContain('data-state="not-observed"');
    expect(html).not.toContain('data-ships="0"');
    expect(html).toContain('<td role="cell" class="v2-cell-check" data-testid="row-token-check"></td>');
    expect(html).toContain('<td role="cell" class="v2-col-value v2-cell-value"></td>');
    expect(html).not.toMatch(/No token tracked|Not checked|\$\d/);
  });

  it('links the ship’s title out to its source, above the row’s stretched link', () => {
    expect(html).toMatch(/<a href="https:\/\/github\.com\/beefyfinance\/x\?utm_source=heyresearch" rel="noopener" class="v2-row-ship-title v2-row-out"/);
    expect(html).toContain('<time dateTime="2026-11-12" class="v2-row-ship-age" data-testid="row-last-ship" title="12 Nov 2026">1 day ago</time>');
    const without = renderToStaticMarkup(createElement('table', null, createElement('tbody', null, createElement(NotTrackedListRow, { project: { ...base, latestShip: null } }))));
    expect(without).toContain('No ship on record');
  });
});

describe('a not-tracked card', () => {
  const html = renderToStaticMarkup(createElement(NotTrackedCard, { project: base }));

  it('is the default card’s shell: one link, the chip with the latest ship, the description, the foot', () => {
    expect(html).toContain('lg-card');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/base/beefy"');
    expect(html).toContain('Not measured');
    expect(html).toContain('Two new vaults');
    expect(html).toContain('Yield optimizer.');
    expect(html).toContain('On Base: Contract source published');
    expect(html).toContain('beefy.com');
    expect(html).not.toMatch(/No token tracked|Valuation|Market cap|\$\d/);
  });
});
