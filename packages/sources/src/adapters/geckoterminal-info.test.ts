import { describe, expect, it } from 'vitest';

import { hasData } from '../adapter';
import { readFixture, stubFetch, testContext } from '../testing';
import { createGeckoterminalInfoAdapter } from './geckoterminal-info';

describe('geckoterminal info adapter', () => {
  const address = '0x3a4386B16FC69B141a4A222a7106B8a0308c1b07';

  it('reads the listing and never the holder fields', async () => {
    const ctx = testContext({ fetchImpl: stubFetch({ status: 200, body: readFixture('geckoterminal-token-info.json') }).fetchImpl });
    const result = await createGeckoterminalInfoAdapter().fetch({ network: 'robinhood', tokenAddress: address }, ctx);
    expect(hasData(result)).toBe(true);
    if (!hasData(result)) return;
    expect(result.data).toMatchObject({ name: 'Walletbeat', symbol: 'WBT', categories: ['Clanker World'], listingVerified: false });
    expect(result.data.websites).toEqual(['https://www.clanker.world/clanker/0x3a4386B16FC69B141a4A222a7106B8a0308c1b07']);
    expect(result.data.imageUrl).toMatch(/^https:\/\/assets\.geckoterminal\.com\//);
    expect(result.data.twitterUrl).toBeUndefined();
    expect(JSON.stringify(result.data)).not.toMatch(/holder|developer/i);
    expect(result.sourceUrl).toContain(`/tokens/${address.toLowerCase()}/info`);
  });

  it('turns handles into account urls and drops placeholder images', async () => {
    const body = JSON.stringify({
      data: {
        attributes: {
          name: 'Pickles',
          twitter_handle: '@picklesonrh',
          telegram_handle: 'https://t.me/pickles_chat',
          discord_url: 'https://discord.gg/pickles',
          websites: ['https://pickles.xyz', 'not a url'],
          image_url: 'https://assets.geckoterminal.com/missing.png',
          categories: ['Meme', ''],
          description: '  A pickle.  ',
          gt_verified: true,
        },
      },
    });
    const ctx = testContext({ fetchImpl: stubFetch({ status: 200, body }).fetchImpl });
    const result = await createGeckoterminalInfoAdapter().fetch({ network: 'robinhood', tokenAddress: address }, ctx);
    expect(hasData(result)).toBe(true);
    if (!hasData(result)) return;
    expect(result.data).toMatchObject({
      twitterUrl: 'https://x.com/picklesonrh',
      telegramUrl: 'https://t.me/pickles_chat',
      discordUrl: 'https://discord.gg/pickles',
      websites: ['https://pickles.xyz'],
      categories: ['Meme'],
      description: 'A pickle.',
      listingVerified: true,
    });
    expect(result.data.imageUrl).toBeUndefined();
  });

  // 2026-11-09 data-trust audit, lane D #7: `t.me/t`, an x.com URL and a sticker pack were stored as Telegram.
  it('keeps only a real Telegram username or invite', async () => {
    const read = async (telegram_handle: string) => {
      const body = JSON.stringify({ data: { attributes: { name: 'X', telegram_handle } } });
      const ctx = testContext({ fetchImpl: stubFetch({ status: 200, body }).fetchImpl });
      const result = await createGeckoterminalInfoAdapter().fetch({ network: 'robinhood', tokenAddress: address }, ctx);
      return hasData(result) ? result.data.telegramUrl : 'no data';
    };
    for (const handle of ['t', '0', '1', 'https://x.com/cryptocoin', 'https://t.co/AbCdEf12', 'https://t.me/addstickers/DijonDuck', 'https://levu.example/']) {
      expect(await read(handle), handle).toBeUndefined();
    }
    expect(await read('pickles_chat')).toBe('https://t.me/pickles_chat');
    expect(await read('https://t.me/+AbCdEfGh12')).toBe('https://t.me/+AbCdEfGh12');
  });

  it('reports an unknown token as missing', async () => {
    const ctx = testContext({ fetchImpl: stubFetch({ status: 404, body: '{"errors":[{"status":"404"}]}' }).fetchImpl });
    const result = await createGeckoterminalInfoAdapter().fetch({ network: 'robinhood', tokenAddress: address }, ctx);
    expect(result.status).toBe('missing');
  });
});
