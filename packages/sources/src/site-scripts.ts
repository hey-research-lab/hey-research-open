import { extractScriptSources } from './html';
import { registrableHost } from './registrable';

/**
 * A site's own script files (2026-11-09, data-trust audit lane C P1-1).
 *
 * HEY asked whether a project's site names its token from the homepage HTML alone, and many sites build the page in
 * the browser: the contract sits only in a script file on the same host (`LABRAT_COIN = { address: '0xaCa0…' }` in
 * lab-rat.net/coin.js, `TOKEN_ADDRESS = '0x8e62…'`, `VITE_TOKEN_ADDRESS`). In a random sample of silent published
 * pages, 23% named their exact contract that way, and read "Not named by the project".
 *
 * Which files HEY reads, never more: those the page itself loads (`<script src>`, `<link rel=modulepreload>`), on the
 * page's own registrable host (`registrableHost`, so a tenant of a shared host is its own site and a CDN or another
 * domain is never read), on the page's port, at most {@link MAX_SITE_SCRIPTS}. App code before framework chunks: a
 * Next.js page loads its webpack runtime, React and polyfills first, and the project's own code after them.
 */
export const MAX_SITE_SCRIPTS = 8;

/** A framework, runtime or vendor chunk by its file name: read after the page's own code. */
const FRAMEWORK_CHUNK =
  /(?:^|[/._-])(?:webpack|framework|polyfills?|runtime|vendors?|chunk-vendors|react|react-dom|turbopack|regenerator|core-js|zone)(?:[._@-]|$)/i;

export function sameHostScriptUrls(html: string, pageUrl: string, max: number = MAX_SITE_SCRIPTS): string[] {
  const page = parseUrl(pageUrl);
  const site = page ? registrableHost(page.hostname) : undefined;
  if (!page || !site) return [];
  const own: { url: string; framework: boolean }[] = [];
  for (const candidate of extractScriptSources(html, page.toString())) {
    if (!isSameSiteScript(candidate, page, site)) continue;
    const file = parseUrl(candidate)!.pathname.split('/').pop() ?? '';
    own.push({ url: candidate, framework: FRAMEWORK_CHUNK.test(file) });
  }
  // A stable order: the page's own code in document order, then the framework chunks in document order.
  return [...own.filter((entry) => !entry.framework), ...own.filter((entry) => entry.framework)].slice(0, Math.max(0, max)).map((entry) => entry.url);
}

/**
 * Whether `scriptUrl` is a file of the site `pageUrl` is on: http(s), no credentials in the URL, the page's
 * registrable host and port. Read before a script is fetched and again on the URL that answered, so a same-host
 * script that redirects to a CDN is never read.
 */
export function isSiteOwnScript(scriptUrl: string, pageUrl: string): boolean {
  const page = parseUrl(pageUrl);
  const site = page ? registrableHost(page.hostname) : undefined;
  return Boolean(page && site && isSameSiteScript(scriptUrl, page, site));
}

function isSameSiteScript(candidate: string, page: URL, site: string): boolean {
  const url = parseUrl(candidate);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return false;
  if (url.username || url.password) return false;
  if (effectivePort(url) !== effectivePort(page)) return false;
  return registrableHost(url.hostname) === site;
}

const effectivePort = (url: URL): string => url.port || (url.protocol === 'https:' ? '443' : '80');

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
