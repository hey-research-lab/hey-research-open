import { describe, expect, it } from 'vitest';

import { extractScriptSources, MAX_SCRIPT_SOURCES } from '../html';
import { isSiteOwnScript, MAX_SITE_SCRIPTS, sameHostScriptUrls } from '../site-scripts';
import { readFixture, stubFetch, testContext } from '../testing';
import { createSiteScriptAdapter } from './site-script';
import { createWebsiteAdapter } from './website';

/**
 * A site that names its token only in its own script files (2026-11-09, data-trust audit lane C P1-1). The fixtures
 * are written in the shapes the audit found on production sites — a client-rendered shell that loads `/coin.js`
 * (lab-rat.net), a Vite bundle carrying `VITE_TOKEN_ADDRESS`, a config of several contracts, a footer disclaimer
 * compiled into a bundle — with addresses made up for the test.
 */
const PAGE = 'https://labrat.example/';
const LABRAT = '0xaca0de5c1b9e3f2a7d4c6e8b0a1f2d3c4b5a6978';
const HOODRAT = '0x8e62a1b3c4d5e6f7081928374655647382910abc';
const spellings = (contract: string) => [contract, contract.slice(2)];
const html = (body = readFixture('site-script-home.html')) => ({ status: 200, body, headers: { 'content-type': 'text/html; charset=utf-8' } });
const script = (name: string, contentType = 'text/javascript; charset=utf-8') => ({ status: 200, body: readFixture(name), headers: { 'content-type': contentType } });

describe('the script files a page loads', () => {
  it('lists every script src and modulepreload in document order, resolved and deduplicated, never a data block', () => {
    expect(extractScriptSources(readFixture('site-script-home.html'), PAGE)).toEqual([
      'https://labrat.example/assets/vendor-react-4f1c2a.js',
      'https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js',
      'https://labrat.example/assets/index-9b7e31.js',
      'https://www.googletagmanager.com/gtag/js?id=G-TEST000000',
      'https://labrat.example/coin.js',
      'https://static.labrat.example/widgets/ticker.js',
    ]);
    expect(extractScriptSources('<script type="application/ld+json" src="/data.json"></script><script type="text/template" src="/t.js"></script>', PAGE)).toEqual([]);
    expect(extractScriptSources('<link rel="preload stylesheet" href="/a.css"><link rel="icon" href="/x.js">', PAGE)).toEqual([]);
  });

  it('reads only the site’s own files: its registrable host and port, app code before framework chunks, at most eight', () => {
    expect(sameHostScriptUrls(readFixture('site-script-home.html'), PAGE)).toEqual([
      'https://labrat.example/assets/index-9b7e31.js',
      'https://labrat.example/coin.js',
      'https://static.labrat.example/widgets/ticker.js',
      'https://labrat.example/assets/vendor-react-4f1c2a.js',
    ]);
    const many = Array.from({ length: 20 }, (_, n) => `<script src="/chunk-${n}.js"></script>`).join('');
    expect(sameHostScriptUrls(many, PAGE)).toHaveLength(MAX_SITE_SCRIPTS);
    expect(sameHostScriptUrls('<script src="https://labrat.example:8443/a.js"></script><script src="https://user:pw@labrat.example/b.js"></script>', PAGE)).toEqual([]);
  });

  it('keeps a shared host’s tenants apart: another Vercel project is not this site', () => {
    const page = 'https://labrat.vercel.app/';
    expect(sameHostScriptUrls('<script src="https://other.vercel.app/a.js"></script><script src="/own.js"></script>', page)).toEqual(['https://labrat.vercel.app/own.js']);
    expect(isSiteOwnScript('https://vercel.app/a.js', page)).toBe(false);
  });

  it('stays linear on a page of unclosed tags', () => {
    const hostile = '<script src="/a.js"'.repeat(100_000);
    const started = Date.now();
    expect(extractScriptSources(hostile, PAGE)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
    const capped = Array.from({ length: MAX_SCRIPT_SOURCES + 10 }, (_, n) => `<script src="/c${n}.js"></script>`).join('');
    expect(extractScriptSources(capped, PAGE)).toHaveLength(MAX_SCRIPT_SOURCES);
  });
});

describe('the website adapter hands over the scripts only when the page is silent', () => {
  const adapter = createWebsiteAdapter();

  it('lists them beside a homepage that names neither spelling', async () => {
    const result = await adapter.fetch({ url: PAGE, mentions: spellings(LABRAT) }, testContext({ fetchImpl: stubFetch(html()).fetchImpl }));
    expect(result.data?.mentioned).toEqual([]);
    expect(result.data?.scriptUrls).toEqual([
      'https://labrat.example/assets/index-9b7e31.js',
      'https://labrat.example/coin.js',
      'https://static.labrat.example/widgets/ticker.js',
      'https://labrat.example/assets/vendor-react-4f1c2a.js',
    ]);
  });

  it('says nothing of them when the homepage names the contract, or when no mention was asked', async () => {
    const named = html(readFixture('site-script-home.html').replace('<div id="root"></div>', `<p>CA: ${LABRAT}</p>`));
    const result = await adapter.fetch({ url: PAGE, mentions: spellings(LABRAT) }, testContext({ fetchImpl: stubFetch(named).fetchImpl }));
    expect(result.data?.mentioned).toEqual(spellings(LABRAT));
    expect(result.data?.scriptUrls).toBeUndefined();
    const plain = await adapter.fetch({ url: PAGE }, testContext({ fetchImpl: stubFetch(html()).fetchImpl }));
    expect(plain.data?.scriptUrls).toBeUndefined();
  });
});

describe('the site-script adapter', () => {
  const adapter = createSiteScriptAdapter();

  it('finds a token declared in a config script, whatever its case', async () => {
    const stub = stubFetch(script('site-script-coin.js.txt'));
    const result = await adapter.fetch({ url: 'https://labrat.example/coin.js', pageUrl: PAGE, mentions: spellings(LABRAT) }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.status).toBe('fresh');
    expect(result.data).toMatchObject({ mentioned: spellings(LABRAT), listed: [], disclaimed: [] });
    expect(stub.requests[0]?.url).toBe('https://labrat.example/coin.js');
  });

  it('finds VITE_TOKEN_ADDRESS in a minified bundle served as application/javascript', async () => {
    const stub = stubFetch(script('site-script-index.js.txt', 'application/javascript'));
    const result = await adapter.fetch({ url: 'https://labrat.example/assets/index-9b7e31.js', pageUrl: PAGE, mentions: spellings(HOODRAT) }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.data?.mentioned).toEqual(spellings(HOODRAT));
    expect(result.data?.listed).toEqual([]);
  });

  it('applies the homepage’s rules: a contract among several is listed, one under a disowning sentence is disclaimed', async () => {
    const listed = await adapter.fetch(
      { url: 'https://labrat.example/config.js', pageUrl: PAGE, mentions: spellings(HOODRAT) },
      testContext({ fetchImpl: stubFetch(script('site-script-config-list.js.txt')).fetchImpl }),
    );
    expect(listed.data?.listed).toEqual(spellings(HOODRAT));
    const disowned = await adapter.fetch(
      { url: 'https://labrat.example/copy.js', pageUrl: PAGE, mentions: spellings(HOODRAT) },
      testContext({ fetchImpl: stubFetch(script('site-script-disclaimer.js.txt')).fetchImpl }),
    );
    expect(disowned.data?.disclaimed).toEqual(spellings(HOODRAT));
  });

  it('never asks another host, and never reads one a same-host file redirected to', async () => {
    const stub = stubFetch(script('site-script-coin.js.txt'));
    const other = await adapter.fetch({ url: 'https://cdn.jsdelivr.net/npm/x.js', pageUrl: PAGE, mentions: spellings(LABRAT) }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(other.errorCode).toBe('BLOCKED_URL');
    expect(stub.callCount()).toBe(0);

    const redirected = stubFetch([
      { status: 302, headers: { location: 'https://cdn.example.net/coin.js' } },
      script('site-script-coin.js.txt'),
    ]);
    const result = await adapter.fetch({ url: 'https://labrat.example/coin.js', pageUrl: PAGE, mentions: spellings(LABRAT) }, testContext({ fetchImpl: redirected.fetchImpl }));
    expect(result.data).toBeUndefined();
    expect(result.errorCode).toBe('BLOCKED_URL');
  });

  it('keeps the SSRF guard: a site whose host resolves to a private address is never fetched', async () => {
    const stub = stubFetch(script('site-script-coin.js.txt'));
    const result = await adapter.fetch(
      { url: 'https://labrat.example/coin.js', pageUrl: PAGE, mentions: spellings(LABRAT) },
      testContext({ fetchImpl: stub.fetchImpl, lookupImpl: async () => ['10.0.0.7'] }),
    );
    expect(result.errorCode).toBe('BLOCKED_URL');
    expect(stub.callCount()).toBe(0);
  });

  it('refuses an HTML answer — an app’s fallback page for a missing file — and a body over 2 MB', async () => {
    const fallback = await adapter.fetch(
      { url: 'https://labrat.example/missing.js', pageUrl: PAGE, mentions: spellings(LABRAT) },
      testContext({ fetchImpl: stubFetch(html()).fetchImpl }),
    );
    expect(fallback.errorCode).toBe('UNSUPPORTED_CONTENT_TYPE');
    const huge = await adapter.fetch(
      { url: 'https://labrat.example/huge.js', pageUrl: PAGE, mentions: spellings(LABRAT) },
      testContext({ fetchImpl: stubFetch({ status: 200, body: `/*${'x'.repeat(2 * 1024 * 1024)}*/ ${LABRAT}`, headers: { 'content-type': 'text/javascript' } }).fetchImpl }),
    );
    expect(huge.data).toBeUndefined();
    expect(huge.errorCode).toBe('TOO_LARGE');
  });
});
