/**
 * A Telegram link HEY may store as a project's TELEGRAM source (2026-11-09, data-trust audit lane D #7, founder
 * delegation).
 *
 * GeckoTerminal's info adapter took any 1–32 character handle and stripped any host in front of it, so ten published
 * pages carried a broken or foreign link: `t.me/t` (sin, wolverinu), `t.me/0` (fluid-protocol), `t.me/1` (chance), an
 * x.com URL turned into `t.me/<handle>` (crypto-coin, wojakhoodmining), a `t.co` redirect (houdini), a website (levu)
 * and sticker packs (dijon-duck, sakoya-blackwood).
 *
 * A Telegram link is a `t.me` or `telegram.me` URL (or a bare handle) naming a public username — 5 to 32 letters,
 * digits or underscores, as Telegram itself requires — or an invite link (`t.me/+<hash>`, `t.me/joinchat/<hash>`),
 * which is a real group. A Telegram page that is no channel (`addstickers`, `addemoji`, `share`, `proxy` …), any other
 * host, and a handle too short are refused. The channel preview `t.me/s/<username>` is that channel. Pure; the SQL
 * twin is `telegramLinkSqlPattern`.
 */

const TELEGRAM_HOSTS = ['t.me', 'telegram.me'] as const;

/** Telegram's own pages: never a project's channel. Compared lower case on the first path segment. */
export const TELEGRAM_RESERVED_PATHS: ReadonlySet<string> = new Set([
  'addstickers', 'addemoji', 'addtheme', 'addlist', 'share', 'proxy', 'socks', 'setlanguage', 'confirmphone', 'login',
  'iv', 'bg', 'invoice', 'boost', 'contact', 'giftcode', 'joinchat',
]);

/** Telegram's username rule: 5 to 32 letters, digits or underscores. */
const TELEGRAM_USERNAME = /^[A-Za-z0-9_]{5,32}$/;
/** An invite hash, as `t.me/+<hash>` or `t.me/joinchat/<hash>` carries it. */
const TELEGRAM_INVITE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The link as HEY stores it — `https://t.me/<username>` or `https://t.me/+<hash>` — or undefined when `value` is no
 * Telegram channel or group. `value` may be a URL or a bare handle (`@name`, `name`).
 */
export function telegramChannelUrl(value: string | null | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  let path: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^(?:www\.)?(?:t\.me|telegram\.me)\//i.test(raw)) {
    let parsed: URL;
    try {
      parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!(TELEGRAM_HOSTS as readonly string[]).includes(host)) return undefined;
    path = parsed.pathname;
  } else {
    // A bare handle: never a URL of another host, never a path.
    if (/[/\s.:]/.test(raw.replace(/^@/, ''))) return undefined;
    path = `/${raw.replace(/^@/, '')}`;
  }

  const segments = path.split('/').filter(Boolean);
  let [first, second] = segments;
  if (!first) return undefined;
  // The channel's web preview is the channel.
  if (first.toLowerCase() === 's' && second) {
    first = second;
    second = undefined;
  }
  if (first.startsWith('+')) {
    const hash = first.slice(1);
    return TELEGRAM_INVITE.test(hash) ? `https://t.me/+${hash}` : undefined;
  }
  if (first.toLowerCase() === 'joinchat') return second && TELEGRAM_INVITE.test(second) ? `https://t.me/+${second}` : undefined;
  if (TELEGRAM_RESERVED_PATHS.has(first.toLowerCase())) return undefined;
  // A post link (`t.me/<channel>/123`) is that channel's.
  if (!TELEGRAM_USERNAME.test(first)) return undefined;
  return `https://t.me/${first}`;
}

/** Whether `value` is a Telegram link HEY may store (`telegramChannelUrl` reads one). */
export const isTelegramChannelUrl = (value: string | null | undefined): boolean => telegramChannelUrl(value) !== undefined;

/**
 * {@link telegramChannelUrl}'s test as one case-insensitive Postgres pattern over a stored URL: a `t.me` or
 * `telegram.me` URL whose first path segment is a username of 5–32 characters (a post under it allowed), the `s/`
 * preview of one, or an invite. The reserved paths are checked apart (`TELEGRAM_RESERVED_PATHS`), since a POSIX pattern
 * has no negative look-ahead. Compare with `~*`.
 */
export const TELEGRAM_LINK_SQL_PATTERN =
  '^https?://(www\\.)?(t\\.me|telegram\\.me)/((s/)?[a-z0-9_]{5,32}|\\+[a-z0-9_-]{8,64}|joinchat/[a-z0-9_-]{8,64})(/[^?#]*)?([?#].*)?$';

/** The first path segment of a stored Telegram URL, lower case, as Postgres reads it (for the reserved-path test). */
export const telegramFirstSegmentSql = (column: string): string =>
  `lower(substring(${column} from '^https?://(?:www\\.)?(?:t\\.me|telegram\\.me)/([^/?#]+)'))`;

const TELEGRAM_JOINCHAT_SQL_PATTERN = '^https?://(www\\.)?(t\\.me|telegram\\.me)/joinchat/[a-z0-9_-]{8,64}(/[^?#]*)?([?#].*)?$';

/**
 * {@link isTelegramChannelUrl} in SQL over a stored URL column (a column reference, never input): true for a link HEY
 * may store. `telegram-link.test.ts` holds the two to one answer on the audit's examples.
 */
export const telegramLinkValidRaw = (column: string): string =>
  `(${column} ~* '${TELEGRAM_LINK_SQL_PATTERN}'
    and (${column} ~* '${TELEGRAM_JOINCHAT_SQL_PATTERN}'
         or coalesce(${telegramFirstSegmentSql(column)}, '') not in (${[...TELEGRAM_RESERVED_PATHS].map((path) => `'${path}'`).join(', ')})))`;
