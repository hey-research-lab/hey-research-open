import { sanitizeText } from '../html';
import type { FeedEntry } from './feed';

/**
 * A changelog published as a web page, read as entries (2026-09-30).
 *
 * Many projects keep their release notes on `/changelog` as HTML, one heading
 * per release — "v1.4.0 — 2026-09-12", "September 12, 2026" — rather than as
 * RSS. When the promotion sweep registers such a page as a CHANGELOG source,
 * the feed reader hands its HTML here, and each *dated* heading becomes one
 * entry: its text is the title, the section under it (to the next heading) is
 * the summary, and the date is the heading's own, a `<time datetime>` in the
 * section, or a date in the section's first line. A heading without a date is
 * not an entry: HEY never invents when something shipped. What an entry means
 * is decided afterwards by the existing ship rules (`draftFromFeedEntry`),
 * exactly as for an RSS item.
 *
 * A page that groups entries under a date (2026-11-03, full audit P2-2): kudo's
 * `/updates` puts a `<time>` above each day's group of `<h3>` entries, all under
 * one `<h1>What shipped</h1>`. Reading forward, the `<h1>` took the first day's
 * date and became a counted entry, and each day's last entry took the next
 * (older) day's date. So a heading with headings nested under it whose own
 * title states no date is a *container*: when the `<time>` elements under it
 * lead the nested headings — each stands nearer the heading after it than the
 * one before it — they are a date group, so the container is never an entry
 * and each nested heading is dated by the newest `<time>` above it inside the
 * container, never by one below it. A `<time>` that follows its own heading (a
 * release dated under its title, "Added" and "Fixed" beneath) is read as before.
 *
 * Linear and bounded: one forward scan for heading tags with bounded
 * attribute and body lengths, at most `MAX_CHANGELOG_ENTRIES` entries.
 */
export const MAX_CHANGELOG_ENTRIES = 50;
const MAX_HEADING_TAG = 600;
const MAX_HEADING_BODY = 2_048;
const MAX_SECTION = 4_096;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const utcDate = (year: number, month: number, day: number): Date | undefined => {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : undefined;
};

/** The first calendar date a short text states: ISO, `2026/09/12`, `September 12, 2026`, `12 Sep 2026`. */
export function dateInText(text: string): Date | undefined {
  const value = text.slice(0, 300);
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(value);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const monthFirst = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/.exec(value);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1]!.toLowerCase()];
    if (month) return utcDate(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }
  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/.exec(value);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2]!.toLowerCase()];
    if (month) return utcDate(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }
  return undefined;
}

const attribute = (tag: string, name: string): string | undefined => {
  const match = new RegExp(`\\s${name}\\s*=\\s*["']([^"'<>]{1,200})["']`, 'i').exec(tag);
  return match?.[1]?.trim();
};

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Whether a body is an HTML page rather than an XML feed. */
export function isHtmlPage(body: string): boolean {
  const head = body.slice(0, 2_048).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html') || (head.includes('<body') && !head.includes('<rss') && !head.includes('<feed'));
}

/** Dated release headings of an HTML changelog page, as feed entries. */
export function parseChangelogPage(html: string, pageUrl: string): FeedEntry[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
    base.hash = '';
  } catch {
    return [];
  }
  const page = base.toString();
  const headings: { start: number; end: number; level: number; tag: string; body: string }[] = [];
  const open = /<h([1-4])(?=[\s>])/gi;
  let match: RegExpExecArray | null;
  while ((match = open.exec(html)) !== null && headings.length < MAX_CHANGELOG_ENTRIES * 4) {
    const tagEnd = html.indexOf('>', match.index);
    if (tagEnd === -1) break;
    if (tagEnd - match.index > MAX_HEADING_TAG) continue;
    const level = match[1];
    const close = html.indexOf(`</h${level}`, tagEnd);
    const closeUpper = html.indexOf(`</H${level}`, tagEnd);
    const closeAt = [close, closeUpper].filter((at) => at !== -1).sort((a, b) => a - b)[0];
    if (closeAt === undefined || closeAt - tagEnd > MAX_HEADING_BODY) continue;
    headings.push({ start: match.index, end: closeAt, level: Number(level), tag: html.slice(match.index, tagEnd + 1), body: html.slice(tagEnd + 1, closeAt) });
    open.lastIndex = closeAt;
  }

  // Every `<time datetime>` on the page, in order (bounded), for the date-group rule.
  const times: { at: number; end: number; date: Date | undefined }[] = [];
  const timeTag = /<time\b[^>]{0,300}\bdatetime\s*=\s*["']([^"'<>]{4,40})["'][^>]{0,300}>/gi;
  let time: RegExpExecArray | null;
  while ((time = timeTag.exec(html)) !== null && times.length < MAX_CHANGELOG_ENTRIES * 8) {
    const close = html.slice(timeTag.lastIndex, timeTag.lastIndex + 200).search(/<\/time\s*>/i);
    times.push({ at: time.index, end: close === -1 ? timeTag.lastIndex : timeTag.lastIndex + close, date: dateInText(time[1]!) });
  }
  const timesBetween = (from: number, to: number) => times.filter((entry) => entry.at > from && entry.at < to);
  const textLength = (from: number, to: number) => sanitizeText(html.slice(from, Math.min(to, from + MAX_SECTION))).length;
  /*
   * A `<time>` leads the heading after it when less text stands between them than between the
   * heading before it and the time: kudo's day stamp sits just above its first entry, while a
   * changelog that dates a release under its heading puts the time right after that heading.
   */
  const leading = new Map<number, boolean>();
  const leads = (entry: { at: number; end: number }) => {
    const known = leading.get(entry.at);
    if (known !== undefined) return known;
    const before = headings.filter((heading) => heading.end < entry.at).at(-1);
    const after = headings.find((heading) => heading.start > entry.end);
    const result = before !== undefined && after !== undefined && textLength(entry.end, after.start) < textLength(before.end, entry.at);
    leading.set(entry.at, result);
    return result;
  };

  // A container: a heading whose title states no date, with headings nested under it (deeper, up to the
  // next heading at its level or above), whose `<time>` elements lead those nested headings — a date group.
  // `groupOf` maps a nested heading to its innermost such container.
  const container = new Set<number>();
  const groupOf = new Map<number, number>();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]!;
    let last = index;
    while (last + 1 < headings.length && headings[last + 1]!.level > heading.level) last += 1;
    if (last === index || dateInText(sanitizeText(heading.body))) continue;
    const regionTimes = timesBetween(heading.end, headings[last + 1]?.start ?? html.length);
    const led = regionTimes.filter(leads).length;
    if (led === 0 || led * 2 < regionTimes.length) continue;
    container.add(index);
    for (let nested = index + 1; nested <= last; nested += 1) {
      const held = groupOf.get(nested);
      if (held === undefined || headings[held]!.level < heading.level) groupOf.set(nested, index);
    }
  }

  const entries: FeedEntry[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < headings.length && entries.length < MAX_CHANGELOG_ENTRIES; index += 1) {
    // A date group's container is never an entry: the dates under it are its entries'.
    if (container.has(index)) continue;
    const heading = headings[index]!;
    const title = sanitizeText(heading.body).slice(0, 200);
    if (title === '') continue;
    const sectionEnd = Math.min(headings[index + 1]?.start ?? html.length, heading.end + MAX_SECTION);
    const section = html.slice(heading.end, sectionEnd);
    const sectionText = sanitizeText(section);
    const group = groupOf.get(index);
    let publishedAt: Date | undefined;
    if (group !== undefined) {
      // Inside a date group: the newest `<time>` above the heading within its container, never one below it.
      publishedAt = dateInText(title) ?? timesBetween(headings[group]!.end, heading.start).at(-1)?.date;
    } else {
      const datetime = /<time\b[^>]{0,300}\bdatetime\s*=\s*["']([^"'<>]{4,40})["']/i.exec(section)?.[1];
      const fromTime = datetime ? dateInText(datetime) : undefined;
      publishedAt = dateInText(title) ?? fromTime ?? dateInText(sectionText.slice(0, 120));
    }
    if (!publishedAt) continue;
    const id = attribute(heading.tag, 'id');
    const anchor = id ?? slug(title);
    const externalId = `${page}#${anchor}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    entries.push({
      externalId,
      title,
      link: id ? `${page}#${encodeURIComponent(id)}` : page,
      ...(sectionText === '' ? {} : { summary: sectionText.slice(0, 600) }),
      publishedAt,
    });
  }
  return entries;
}
