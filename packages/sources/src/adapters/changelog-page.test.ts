import { describe, expect, it } from 'vitest';

import { hasData } from '../adapter';
import { readFixture, stubFetch, testContext } from '../testing';
import { dateInText, isHtmlPage, parseChangelogPage } from './changelog-page';
import { createFeedAdapter } from './feed';

/**
 * An HTML changelog page read as dated entries (2026-09-30): only a heading
 * that states a date is an entry, and only a CHANGELOG source reads HTML so.
 */
describe('an HTML changelog page', () => {
  const html = readFixture('changelog-page.html');
  const url = 'https://neon.example/changelog#top';

  it('turns each dated release heading into an entry, and skips the undated ones', () => {
    const entries = parseChangelogPage(html, url);
    expect(entries.map((entry) => [entry.title, entry.publishedAt?.toISOString().slice(0, 10)])).toEqual([
      ['v1.4.0 — 2026-09-12', '2026-09-12'],
      // The date from the section's <time datetime>.
      ['v1.3.0', '2026-08-30'],
      ['September 2, 2026 — Docs refresh', '2026-09-02'],
      // "Coming soon" has no date and is not an entry; the section's first line dates v1.2.0.
      ['v1.2.0', '2026-07-14'],
      // A future date is kept here; ship ingestion skips it like an undated entry.
      ['v9.0.0 — 2031-01-01', '2031-01-01'],
    ]);
  });

  it('keys an entry on the page and the heading’s anchor, never on the fragment it was read with', () => {
    const [first, second] = parseChangelogPage(html, url);
    expect(first).toMatchObject({ externalId: 'https://neon.example/changelog#v1-4-0', link: 'https://neon.example/changelog#v1-4-0' });
    expect(first?.summary).toContain('Released the vault migration tool.');
    expect(second?.summary).toContain('Launched staking rewards dashboard & new SDK release.');
    const [, , third] = parseChangelogPage(html, url);
    // No id: the anchor is the heading's slug, the link the page itself.
    expect(third).toMatchObject({ externalId: 'https://neon.example/changelog#september-2-2026-docs-refresh', link: 'https://neon.example/changelog' });
  });

  it('reads calendar dates in the forms changelogs use, and refuses impossible ones', () => {
    expect(dateInText('Released 2026-09-12')?.toISOString()).toBe('2026-09-12T00:00:00.000Z');
    expect(dateInText('Sept. 3rd, 2026')?.toISOString()).toBe('2026-09-03T00:00:00.000Z');
    expect(dateInText('3 September 2026')?.toISOString()).toBe('2026-09-03T00:00:00.000Z');
    expect(dateInText('2026/02/30')).toBeUndefined();
    expect(dateInText('v1.2.3')).toBeUndefined();
  });

  it('knows an HTML page from a feed', () => {
    expect(isHtmlPage(html)).toBe(true);
    expect(isHtmlPage(readFixture('feed-rss.xml'))).toBe(false);
  });

  it('never makes a date group’s container an entry, and dates each entry by the day stamp above it (2026-11-03, full audit P2-2)', () => {
    // A page that stamps each day once above that day's entries, all under one undated <h1>.
    const entries = parseChangelogPage(readFixture('changelog-page-date-groups.html'), 'https://orbit.example/updates');
    expect(entries.map((entry) => [entry.title, entry.publishedAt?.toISOString().slice(0, 10)])).toEqual([
      // "What shipped" is the page's container: before, it was an entry dated by the first day's stamp.
      ["Today's featured story follows the new crew", '2026-11-02'],
      ['Open a proof in a popup instead of a new tab', '2026-11-02'],
      // Before, the last entry of a day took the next (older) day's stamp below it.
      ['Mint a collectible from the dashboard', '2026-11-01'],
      ['Orbit is live on mainnet', '2026-10-28'],
    ]);
  });

  it('reads a time that follows its own heading as before, and keeps a one-day page’s container out', () => {
    // The classic layout: the <time> sits right under the heading it dates.
    const classic =
      '<html><body><h1>Releases</h1><h2>v2.0.0</h2><p><time datetime="2026-10-01">1 Oct</time> The vault ships.</p><h3>Added</h3><p>A vault.</p><h3>Fixed</h3><p>Rounding.</p><h2>v1.9.0</h2><p><time datetime="2026-09-20">20 Sep</time> Swaps.</p></body></html>';
    expect(parseChangelogPage(classic, 'https://neon.example/releases').map((entry) => [entry.title, entry.publishedAt?.toISOString().slice(0, 10)])).toEqual([
      ['v2.0.0', '2026-10-01'],
      ['v1.9.0', '2026-09-20'],
    ]);
    const oneDay =
      '<html><body><h1>What shipped</h1><p>Every release, the app and the SDK, with links to the source for each one.</p><div><time datetime="2026-11-02">2026-11-02</time></div><article><span>app</span><h3>Agent exploration page</h3><p>Browse every agent.</p></article><article><span>app</span><h3>A new homepage</h3><p>Metrics up front.</p></article></body></html>';
    expect(parseChangelogPage(oneDay, 'https://orbit.example/updates').map((entry) => [entry.title, entry.publishedAt?.toISOString().slice(0, 10)])).toEqual([
      ['Agent exploration page', '2026-11-02'],
      ['A new homepage', '2026-11-02'],
    ]);
  });

  it('stays linear on hostile markup: unclosed headings and a flood of tags', () => {
    const hostile = `<html><body>${'<h2 '.repeat(20_000)}${'<h2>2026-09-01</h2><p>x</p>'.repeat(200)}</body></html>`;
    const started = Date.now();
    const entries = parseChangelogPage(hostile, 'https://neon.example/changelog');
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(entries.length).toBeLessThanOrEqual(50);
  });
});

describe('the feed reader on a changelog source', () => {
  it('reads an HTML changelog page only when told the source is a CHANGELOG page', async () => {
    const html = readFixture('changelog-page.html');
    const stub = stubFetch({ status: 200, body: html, headers: { 'content-type': 'text/html; charset=utf-8' } });
    const asChangelog = await createFeedAdapter().fetch({ url: 'https://neon.example/changelog', changelogPage: true }, testContext({ fetchImpl: stub.fetchImpl, lookupImpl: async () => ['93.184.216.34'] }));
    expect(hasData(asChangelog)).toBe(true);
    expect(asChangelog.data?.entries.length).toBe(5);

    const asFeed = await createFeedAdapter().fetch({ url: 'https://neon.example/changelog' }, testContext({ fetchImpl: stub.fetchImpl, lookupImpl: async () => ['93.184.216.34'] }));
    // Any other caller never mistakes a page for a feed.
    expect(asFeed.data?.entries ?? []).toEqual([]);
  });

  it('still reads a real feed at a changelog source as a feed', async () => {
    const stub = stubFetch({ status: 200, body: readFixture('feed-rss.xml'), headers: { 'content-type': 'application/rss+xml' } });
    const result = await createFeedAdapter().fetch({ url: 'https://neon.example/changelog.xml', changelogPage: true }, testContext({ fetchImpl: stub.fetchImpl, lookupImpl: async () => ['93.184.216.34'] }));
    expect(hasData(result)).toBe(true);
    expect(result.data?.entries.length).toBeGreaterThan(0);
  });
});
