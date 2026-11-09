import { describe, expect, it } from 'vitest';

import { isTelegramChannelUrl, isTelegramMessageLink, TELEGRAM_LINK_SQL_PATTERN, TELEGRAM_RESERVED_PATHS, telegramChannelUrl, telegramLinkValidRaw } from './telegram-link';

/**
 * The Postgres twin, read in JavaScript: the pattern uses only syntax POSIX AREs and JS share (`~*` is the `i` flag),
 * and the reserved test is the first path segment.
 */
const sqlTwin = (url: string): boolean => {
  if (!new RegExp(TELEGRAM_LINK_SQL_PATTERN, 'i').test(url)) return false;
  if (/^https?:\/\/(www\.)?(t\.me|telegram\.me)\/joinchat\/[a-z0-9_-]{8,64}(\/[^?#]*)?([?#].*)?$/i.test(url)) return true;
  const first = /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? '';
  return !TELEGRAM_RESERVED_PATHS.has(first);
};

/* 2026-11-09 data-trust audit, lane D #7: the production examples. */
describe('a Telegram link HEY may store', () => {
  it('refuses the broken links ten published pages carried', () => {
    for (const value of [
      'https://t.me/t', // sin, wolverinu
      'https://t.me/0', // fluid-protocol
      'https://t.me/1', // chance
      't', '0', '@1',
      'https://x.com/cryptocoin', // crypto-coin, wojakhoodmining
      'https://t.co/AbCdEf12', // houdini
      'https://levu.example/', // levu
      'https://t.me/addstickers/DijonDuck', // dijon-duck, sakoya-blackwood
      'https://t.me/addemoji/Pack',
      'https://t.me/share/url?url=x',
      'https://t.me/joinchat',
      'https://t.me/abcd', // four characters: no Telegram username is that short
      'https://t.me/has.dot',
      'javascript:alert(1)',
      '',
    ]) {
      expect(telegramChannelUrl(value), value).toBeUndefined();
      if (/^https?:/.test(value)) expect(sqlTwin(value), value).toBe(false);
    }
  });

  it('keeps a username, its preview and a post under it, and an invite', () => {
    expect(telegramChannelUrl('https://t.me/pickles_chat')).toBe('https://t.me/pickles_chat');
    expect(telegramChannelUrl('pickles_chat')).toBe('https://t.me/pickles_chat');
    expect(telegramChannelUrl('@pickles_chat')).toBe('https://t.me/pickles_chat');
    expect(telegramChannelUrl('t.me/pickles_chat')).toBe('https://t.me/pickles_chat');
    expect(telegramChannelUrl('https://telegram.me/pickles_chat')).toBe('https://t.me/pickles_chat');
    expect(telegramChannelUrl('https://t.me/s/pickles_chat')).toBe('https://t.me/pickles_chat');
    expect(telegramChannelUrl('https://t.me/pickles_chat/123')).toBe('https://t.me/pickles_chat');
    expect(telegramChannelUrl('https://t.me/+AbCdEfGh12')).toBe('https://t.me/+AbCdEfGh12');
    expect(telegramChannelUrl('https://t.me/joinchat/AbCdEfGh12')).toBe('https://t.me/+AbCdEfGh12');
    for (const url of ['https://t.me/pickles_chat', 'https://www.t.me/pickles_chat/', 'https://t.me/s/pickles_chat', 'https://t.me/+AbCdEfGh12', 'https://t.me/joinchat/AbCdEfGh12', 'https://T.ME/Pickles_Chat?start=1']) {
      expect(isTelegramChannelUrl(url), url).toBe(true);
      expect(isTelegramMessageLink(url), url).toBe(false);
      expect(sqlTwin(url), url).toBe(true);
    }
  });

  /* 2026-11-10 (founder delegation, overnight): evrithng's TELEGRAM source was `t.me/EVRITHNG_APP/1`, one post. */
  it('reads a message link as its channel when written, and holds one stored as it is', () => {
    for (const url of ['https://t.me/EVRITHNG_APP/1', 'https://t.me/pickles_chat/123', 'https://t.me/s/pickles_chat/45', 't.me/EVRITHNG_APP/1/']) {
      expect(isTelegramMessageLink(url), url).toBe(true);
      expect(isTelegramChannelUrl(url), url).toBe(false);
      if (/^https?:/.test(url)) expect(sqlTwin(url), url).toBe(false);
    }
    expect(telegramChannelUrl('https://t.me/EVRITHNG_APP/1')).toBe('https://t.me/EVRITHNG_APP');
    expect(telegramChannelUrl('https://t.me/s/pickles_chat/45')).toBe('https://t.me/pickles_chat');
  });

  it('builds a SQL predicate that names the column and no input', () => {
    const raw = telegramLinkValidRaw('s.url');
    expect(raw).toContain('s.url ~*');
    expect(raw).toContain("'addstickers'");
  });
});
