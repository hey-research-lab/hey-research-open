import { z } from 'zod';

import { errorResult, type SourceAdapter, type SourceContext, type SourceResult } from '../adapter';
import { performSourceFetch } from '../http/perform';
import { isSiteOwnScript } from '../site-scripts';
import { contractMentionsIn, hashContent } from './website';

/**
 * One of a site's own script files, read for a contract (2026-11-09, data-trust audit lane C P1-1).
 *
 * The website adapter reads the homepage; when the page names none of the contracts asked for, it lists the page's
 * own script files (`WebsiteMetadata.scriptUrls`, `site-scripts.ts`). This reads one of them on the same fetch path —
 * `performSourceFetch`, the builder-URL SSRF guard (DNS resolved before every hop, private ranges and HEY's own
 * origin refused, redirects revalidated per hop), the caller's context and its `lookupImpl` — capped at
 * {@link MAX_SITE_SCRIPT_BYTES}, and asks it exactly what the homepage is asked: which contracts it names, which only
 * in a list of several, which it disowns (`contractMentionsIn`, the website adapter's own tests). Only the verdict
 * leaves the adapter, never the body. A file on another host, before or after a redirect, is never read as the site's.
 */
export type SiteScriptInput = {
  url: string;
  /** The page that loads the script: its registrable host and port bound which files are the site's own. */
  pageUrl: string;
  mentions: readonly string[];
};

export type SiteScriptReading = {
  url: string;
  contentHash: string;
  mentioned: string[];
  listed: string[];
  disclaimed: string[];
};

/** The website adapter's own cap on a body (2 MB): a script is read under the same bound as the page. */
export const MAX_SITE_SCRIPT_BYTES = 2 * 1024 * 1024;

/**
 * The content types a script file is served under. `text/plain` and `application/octet-stream` are what a bare static
 * host answers for a `.js` it has no type for; a `text/html` answer is an SPA's fallback page for a file it lacks,
 * never a script, and is refused.
 */
export const SITE_SCRIPT_CONTENT_TYPES = [
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'text/ecmascript',
  'text/plain',
  'application/octet-stream',
] as const;

const CACHE_TTL_SECONDS = 21_600;

export function createSiteScriptAdapter(): SourceAdapter<SiteScriptInput, SiteScriptReading> {
  return {
    name: 'website-script',

    canHandle(input) {
      return isSiteOwnScript(input.url, input.pageUrl);
    },

    async fetch(input, ctx: SourceContext): Promise<SourceResult<SiteScriptReading>> {
      if (!isSiteOwnScript(input.url, input.pageUrl)) {
        return errorResult(ctx, 'BLOCKED_URL', 'a script on another host is not the site’s own', { sourceUrl: input.url });
      }
      const result = await performSourceFetch(
        ctx,
        {
          url: input.url,
          headers: { accept: 'application/javascript, text/javascript, */*;q=0.1' },
          allowedContentTypes: SITE_SCRIPT_CONTENT_TYPES,
          // Named by a page a builder or a launch form declared, so the SSRF guard applies.
          enforceUrlSafety: true,
          maxBytes: MAX_SITE_SCRIPT_BYTES,
        },
        {
          schema: z.string(),
          parse: (body) => body,
          cacheTtlSeconds: CACHE_TTL_SECONDS,
          normalize: (body, response): SiteScriptReading => ({
            url: response.url ?? input.url,
            contentHash: hashContent(body),
            ...contractMentionsIn(body.toLowerCase(), input.mentions),
          }),
        },
      );
      // A same-host file that redirected to a CDN or another domain: what answered is not the site's, so nothing was read.
      if (result.data && !isSiteOwnScript(result.data.url, input.pageUrl)) {
        return errorResult(ctx, 'BLOCKED_URL', 'the script redirected off the site’s host', { sourceUrl: result.data.url });
      }
      return result;
    },
  };
}
