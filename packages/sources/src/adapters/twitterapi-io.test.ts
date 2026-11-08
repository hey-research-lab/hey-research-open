import { describe, expect, it } from 'vitest';

import { readFixture, stubFetch, testContext } from '../testing';
import {
  contractAddressesIn,
  createTwitterApiIoAccountInfoAdapter,
  createTwitterApiIoLastPostsAdapter,
  createTwitterApiIoUserInfoAdapter,
  TWITTERAPI_IO_BASE_URL,
  TWITTERAPI_IO_MAX_PAGE_CREDITS,
  TWITTERAPI_IO_POST_CREDITS,
  TWITTERAPI_IO_PROFILE_CREDITS,
  X_POST_TEXT_MAX,
  resolveXShortLink,
  xProfileImageUrl,
  xShortLinkOf,
} from './twitterapi-io';

/**
 * twitterapi.io (2026-10-18): the official-account profile read and the newest page of that account's own
 * posts, against saved fixtures shaped like the provider's documented answers (docs.twitterapi.io, read
 * 2026-10-18). No live network: `vitest.setup.ts` fails any real fetch.
 */
const json = (body: string, extra: Record<string, string> = {}) => ({ status: 200, body, headers: { 'content-type': 'application/json', ...extra } });
const KEY = 'test-key-not-a-secret';

describe('twitterapi.io profile read', () => {
  const adapter = createTwitterApiIoUserInfoAdapter();

  it('asks for one handle with the key in X-API-Key and keeps identity facts only', async () => {
    const stub = stubFetch(json(readFixture('twitterapi-io-user-active.json')));
    const result = await adapter.fetch({ apiKey: KEY, userName: 'agentos_hq' }, testContext({ fetchImpl: stub.fetchImpl }));

    expect(stub.callCount()).toBe(1);
    expect(stub.requests[0]!.url).toBe(`${TWITTERAPI_IO_BASE_URL}/twitter/user/info?userName=agentos_hq`);
    expect(new Headers(stub.requests[0]!.init?.headers).get('x-api-key')).toBe(KEY);
    expect(result.status).toBe('fresh');
    expect(result.data).toEqual({
      kind: 'ACTIVE',
      userId: '1567890123456789012',
      userName: 'agentos_hq',
      displayName: 'AgentOS',
      createdAt: new Date('2022-09-08T11:20:31.000Z'),
      isBlueVerified: true,
      verifiedType: 'Business',
      // The profile website and the bio's link, expanded; the t.co short link is never a destination.
      profileUrls: ['https://www.agentos.example/', 'https://docs.agentos.example/'],
      // The account's own picture (2026-10-31): the logo of a project whose account HEY confirmed; never the banner.
      profileImageUrl: 'https://pbs.twimg.com/profile_images/1/a.jpg',
    });
    // Popularity is not research: no follower, following or engagement count leaves the adapter.
    expect(JSON.stringify(result.data)).not.toMatch(/follow|favourite|statuses|media|12873/i);
    expect(result.meteredUnits).toBe(TWITTERAPI_IO_PROFILE_CREDITS);
  });

  it('reads the profile links where the live answer carries them: `entities`, with no `profile_bio`', async () => {
    // Shape read from the live API on 2026-10-18: the docs' `profile_bio.entities` is absent, the links sit in
    // `data.entities`, and `createdAt` is X's own date format. Reading only `profile_bio` left every profile linkless.
    const stub = stubFetch(json(readFixture('twitterapi-io-user-active-live.json')));
    const result = await adapter.fetch({ apiKey: KEY, userName: 'agentos_hq' }, testContext({ fetchImpl: stub.fetchImpl }));

    expect(result.status).toBe('fresh');
    expect(result.data).toMatchObject({
      kind: 'ACTIVE',
      userId: '1567890123456789012',
      createdAt: new Date('2022-09-08T11:20:31.000Z'),
      profileUrls: ['https://www.agentos.example/', 'https://docs.agentos.example/'],
    });
  });

  it('reads a suspended account as SUSPENDED with the provider’s reason', async () => {
    const stub = stubFetch(json(readFixture('twitterapi-io-user-suspended.json')));
    const result = await adapter.fetch({ apiKey: KEY, userName: 'gone_project' }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.status).toBe('fresh');
    expect(result.data).toEqual({ kind: 'SUSPENDED', reason: 'Suspended' });
  });

  it('reads an account unavailable for another reason as UNAVAILABLE', async () => {
    const stub = stubFetch(json(readFixture('twitterapi-io-user-unavailable.json')));
    const result = await adapter.fetch({ apiKey: KEY, userName: 'locked_project' }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.data).toEqual({ kind: 'UNAVAILABLE', reason: 'Protected' });
  });

  it('reads “user not found” as NOT_FOUND, and any other provider error as an error (never NOT_FOUND)', async () => {
    const missing = await adapter.fetch({ apiKey: KEY, userName: 'never_existed' }, testContext({ fetchImpl: stubFetch(json(readFixture('twitterapi-io-user-not-found.json'))).fetchImpl }));
    expect(missing.status).toBe('fresh');
    expect(missing.data).toEqual({ kind: 'NOT_FOUND' });

    const other = await adapter.fetch({ apiKey: KEY, userName: 'agentos_hq' }, testContext({ fetchImpl: stubFetch(json('{"status":"error","msg":"insufficient credits"}')).fetchImpl }));
    expect(other.status).toBe('error');
    expect(other.data).toBeUndefined();
    expect(other.errorMessage).toMatch(/insufficient credits/);
  });

  it('refuses a malformed answer whole', async () => {
    const result = await adapter.fetch({ apiKey: KEY, userName: 'agentos_hq' }, testContext({ fetchImpl: stubFetch(json(readFixture('twitterapi-io-user-malformed.json'))).fetchImpl }));
    expect(result.status).toBe('error');
    expect(result.errorCode).toBe('INVALID_RESPONSE');
    expect(result.data).toBeUndefined();
  });

  it('refuses an oversized answer before parsing it', async () => {
    const big = JSON.stringify({ status: 'success', data: { id: '1', userName: 'agentos_hq', name: 'x', padding: 'a'.repeat(70 * 1024) } });
    const result = await adapter.fetch({ apiKey: KEY, userName: 'agentos_hq' }, testContext({ fetchImpl: stubFetch(json(big)).fetchImpl }));
    expect(result.status).toBe('error');
    expect(result.errorCode).toBe('TOO_LARGE');
  });

  it('refuses an answer about another handle, and one served from another host', async () => {
    const other = await adapter.fetch({ apiKey: KEY, userName: 'somebody_else' }, testContext({ fetchImpl: stubFetch(json(readFixture('twitterapi-io-user-active.json'))).fetchImpl }));
    expect(other.status).toBe('error');
    expect(other.errorMessage).toMatch(/answered for @agentos_hq/);

    const moved = await adapter.fetch(
      { apiKey: KEY, userName: 'agentos_hq' },
      testContext({ fetchImpl: stubFetch({ ...json(readFixture('twitterapi-io-user-active.json')), url: 'https://evil.example/twitter/user/info' }).fetchImpl }),
    );
    expect(moved.status).toBe('error');
    expect(moved.errorMessage).toMatch(/another host/);
  });

  it('asks nothing for a string that is not an X handle, or without a key', async () => {
    const stub = stubFetch(json('{}'));
    for (const userName of ['', 'has space', 'a'.repeat(16), '../../etc', 'x.com/abc']) {
      const result = await adapter.fetch({ apiKey: KEY, userName }, testContext({ fetchImpl: stub.fetchImpl }));
      expect(result.status).toBe('error');
    }
    await adapter.fetch({ apiKey: '', userName: 'agentos_hq' }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(stub.callCount()).toBe(0);
  });

  it('meters a refused call too: the provider may have billed it', async () => {
    const result = await adapter.fetch({ apiKey: KEY, userName: 'agentos_hq' }, testContext({ fetchImpl: stubFetch({ status: 429, body: '', headers: { 'retry-after': '30' } }).fetchImpl }));
    expect(result.status).toBe('rate_limited');
    expect(result.meteredUnits).toBe(TWITTERAPI_IO_PROFILE_CREDITS);
  });
});

describe('an account’s own profile picture (2026-10-31)', () => {
  it('keeps pbs.twimg.com profile images only, at 400×400', () => {
    expect(xProfileImageUrl('https://pbs.twimg.com/profile_images/2115270562654441472/Fercs4z__normal.png')).toBe('https://pbs.twimg.com/profile_images/2115270562654441472/Fercs4z__400x400.png');
    expect(xProfileImageUrl('https://pbs.twimg.com/profile_images/1/a_bigger.jpg?x=1')).toBe('https://pbs.twimg.com/profile_images/1/a_400x400.jpg');
    expect(xProfileImageUrl('https://pbs.twimg.com/profile_images/1/a.jpg')).toBe('https://pbs.twimg.com/profile_images/1/a.jpg');
  });

  it('refuses X’s default picture, a post’s media, a banner and anything not https', () => {
    expect(xProfileImageUrl('https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png')).toBeUndefined();
    expect(xProfileImageUrl('https://pbs.twimg.com/media/GabcDEF.jpg')).toBeUndefined();
    expect(xProfileImageUrl('https://pbs.twimg.com/profile_banners/1/a')).toBeUndefined();
    expect(xProfileImageUrl('http://pbs.twimg.com/profile_images/1/a.jpg')).toBeUndefined();
    expect(xProfileImageUrl('https://pbs.twimg.com.evil.example/profile_images/1/a.jpg')).toBeUndefined();
    expect(xProfileImageUrl(null)).toBeUndefined();
  });
});

describe('twitterapi.io newest posts read', () => {
  const adapter = createTwitterApiIoLastPostsAdapter();

  it('reads the account’s own posts only: no retweet of another, no reply, no other author', async () => {
    const stub = stubFetch(json(readFixture('twitterapi-io-last-tweets.json')));
    const result = await adapter.fetch({ apiKey: KEY, userId: '1567890123456789012' }, testContext({ fetchImpl: stub.fetchImpl }));

    expect(stub.requests[0]!.url).toBe(`${TWITTERAPI_IO_BASE_URL}/twitter/user/last_tweets?userId=1567890123456789012&includeReplies=false`);
    expect(result.status).toBe('fresh');
    const page = result.data!;
    expect(page.posts.map((post) => post.id)).toEqual(['1846000000000000005', '1845900000000000004', '1845400000000000000']);
    expect(page.skipped).toBe(3);
    expect(page.returned).toBe(6);
    expect(page.hasNextPage).toBe(true);
    // Six posts returned: six posts billed.
    expect(result.meteredUnits).toBe(6 * TWITTERAPI_IO_POST_CREDITS);

    const [release, changelog, quote] = page.posts;
    expect(release).toMatchObject({
      url: 'https://x.com/agentos_hq/status/1846000000000000005',
      createdAt: new Date('2026-10-17T14:02:11.000Z'),
      expandedUrls: ['https://github.com/agentos/agentos/releases/tag/v2.4.0', 'https://github.com/agentos/router'],
      contractAddresses: ['0xa000000000000000000000000000000000000001'],
    });
    expect(changelog!.contractAddresses).toEqual(['0xb000000000000000000000000000000000000002']);
    expect(quote!.expandedUrls).toEqual(['https://gitlab.com/agentos/integrations/-/releases/v1.0']);
    // Kept: id, url, date, bounded text, links and addresses. No counts, no author profile.
    expect(Object.keys(release!).sort()).toEqual(['contractAddresses', 'createdAt', 'expandedUrls', 'id', 'text', 'url']);
    expect(JSON.stringify(page)).not.toMatch(/likeCount|viewCount|retweetCount|followers|someone_else|a_reader/);
  });

  it('keeps at most 280 characters of a post, and reads an address beyond them', async () => {
    const long = `${'word '.repeat(80)}0xc000000000000000000000000000000000000003`;
    const body = JSON.stringify({
      status: 'success',
      data: { tweets: [{ id: '1', url: 'https://x.com/agentos_hq/status/1', text: long, createdAt: '2026-10-17T00:00:00Z', isReply: false, author: { id: '5' }, entities: { urls: [] }, retweeted_tweet: null }] },
      has_next_page: false,
    });
    const result = await adapter.fetch({ apiKey: KEY, userId: '5' }, testContext({ fetchImpl: stubFetch(json(body)).fetchImpl }));
    const [post] = result.data!.posts;
    expect(Array.from(post!.text).length).toBeLessThanOrEqual(X_POST_TEXT_MAX);
    expect(post!.contractAddresses).toEqual(['0xc000000000000000000000000000000000000003']);
  });

  it('refuses a malformed page and an oversized one', async () => {
    const malformed = await adapter.fetch({ apiKey: KEY, userId: '5' }, testContext({ fetchImpl: stubFetch(json('{"status":"success","data":{"tweets":[{"id":{"bad":1}}]}}')).fetchImpl }));
    expect(malformed.status).toBe('error');
    expect(malformed.errorCode).toBe('INVALID_RESPONSE');

    const big = JSON.stringify({ status: 'success', data: { tweets: [] }, padding: 'a'.repeat(3 * 1024 * 1024) });
    const oversized = await adapter.fetch({ apiKey: KEY, userId: '5' }, testContext({ fetchImpl: stubFetch(json(big)).fetchImpl }));
    expect(oversized.errorCode).toBe('TOO_LARGE');
  });

  // 2026-10-19: a page HEY could not read was booked at the 15-credit floor, though the provider may bill a full page.
  it('books a full page for an answer that is not fresh', async () => {
    const refused = await adapter.fetch({ apiKey: KEY, userId: '5' }, testContext({ fetchImpl: stubFetch(json('{"status":"error","msg":"try later"}')).fetchImpl }));
    expect(refused.status).toBe('error');
    expect(refused.meteredUnits).toBe(TWITTERAPI_IO_MAX_PAGE_CREDITS);

    const malformed = await adapter.fetch({ apiKey: KEY, userId: '5' }, testContext({ fetchImpl: stubFetch(json('{"status":"success","data":{"tweets":[{"id":{"bad":1}}]}}')).fetchImpl }));
    expect(malformed.status).toBe('error');
    expect(malformed.meteredUnits).toBe(TWITTERAPI_IO_MAX_PAGE_CREDITS * (malformed.attempts ?? 1));
  });

  it('asks nothing for an id that is not numeric', async () => {
    const stub = stubFetch(json('{}'));
    const result = await adapter.fetch({ apiKey: KEY, userId: 'agentos_hq' }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.status).toBe('error');
    expect(stub.callCount()).toBe(0);
  });
});

describe('twitterapi.io account balance (2026-11-08)', () => {
  const adapter = createTwitterApiIoAccountInfoAdapter();

  it('asks /oapi/my/info with the key in X-API-Key and keeps the two credit figures only', async () => {
    const stub = stubFetch(json(readFixture('twitterapi-io-my-info.json')));
    const result = await adapter.fetch({ apiKey: KEY }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(stub.callCount()).toBe(1);
    expect(stub.requests[0]!.url).toBe(`${TWITTERAPI_IO_BASE_URL}/oapi/my/info`);
    expect(new Headers(stub.requests[0]!.init?.headers).get('x-api-key')).toBe(KEY);
    expect(result.status).toBe('fresh');
    expect(result.data).toEqual({ rechargeCredits: 1_234_567, bonusCredits: 50_000 });
    // Plumbing, not a metered X read: the balance costs no credits of the day's ceiling.
    expect(result.meteredUnits).toBeUndefined();
  });

  it('reads an answer with no bonus figure, and a balance of 0 as 0', async () => {
    const result = await adapter.fetch({ apiKey: KEY }, testContext({ fetchImpl: stubFetch(json('{"recharge_credits":0}')).fetchImpl }));
    expect(result.data).toEqual({ rechargeCredits: 0 });
  });

  it('refuses a figure that is not an integer, a missing balance, and an answer from another host', async () => {
    const malformed = await adapter.fetch({ apiKey: KEY }, testContext({ fetchImpl: stubFetch(json(readFixture('twitterapi-io-my-info-malformed.json'))).fetchImpl }));
    expect(malformed.status).toBe('error');
    expect(malformed.data).toBeUndefined();
    const missing = await adapter.fetch({ apiKey: KEY }, testContext({ fetchImpl: stubFetch(json('{"total_bonus_credits":5}')).fetchImpl }));
    expect(missing.status).toBe('error');
    const moved = await adapter.fetch({ apiKey: KEY }, testContext({ fetchImpl: stubFetch({ ...json(readFixture('twitterapi-io-my-info.json')), url: 'https://evil.example/oapi/my/info' }).fetchImpl }));
    expect(moved.status).toBe('error');
    expect(moved.errorMessage).toMatch(/another host/);
  });

  it('reports a refusal with its status, and asks nothing without a key', async () => {
    const refused = await adapter.fetch({ apiKey: KEY }, testContext({ fetchImpl: stubFetch({ status: 402, body: '{"msg":"insufficient credits"}', headers: { 'content-type': 'application/json' } }).fetchImpl }));
    expect(refused.status).toBe('error');
    expect(refused.httpStatus).toBe(402);
    const stub = stubFetch(json('{}'));
    const none = await adapter.fetch({ apiKey: '' }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(none.status).toBe('error');
    expect(stub.callCount()).toBe(0);
  });
});

describe('contract addresses in a post', () => {
  it('finds each 0x…40-hex address once, lower-cased, in the text and the links', () => {
    expect(
      contractAddressesIn('CA: 0xAbCdEf0000000000000000000000000000000001 and again 0xabcdef0000000000000000000000000000000001', [
        'https://explorer.example/address/0x1111111111111111111111111111111111111111',
      ]),
    ).toEqual(['0xabcdef0000000000000000000000000000000001', '0x1111111111111111111111111111111111111111']);
  });

  it('ignores a hash, a short hex and an address glued to more hex', () => {
    expect(contractAddressesIn(`tx 0x${'a'.repeat(64)} short 0x1234 glued 0x${'b'.repeat(41)}`)).toEqual([]);
    expect(contractAddressesIn(null)).toEqual([]);
  });
});


describe('X short links on a profile (2026-11-08)', () => {
  const adapter = createTwitterApiIoUserInfoAdapter();

  it('keeps a profile website that arrives only as a t.co link apart, never as a destination', async () => {
    const stub = stubFetch(json(readFixture('twitterapi-io-user-shortlink-only.json')));
    const result = await adapter.fetch({ apiKey: KEY, userName: 'shortlink_hq' }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.status).toBe('fresh');
    expect(result.data).toMatchObject({ kind: 'ACTIVE', profileUrls: [], profileShortLinks: ['https://t.co/X3ZZQwi2hB'] });
  });

  it('keeps no short link when the answer expanded the links itself', async () => {
    const stub = stubFetch(json(readFixture('twitterapi-io-user-active-live.json')));
    const result = await adapter.fetch({ apiKey: KEY, userName: 'agentos_hq' }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.data && 'profileShortLinks' in result.data).toBe(false);
  });

  it('reads where a t.co link leads from its redirect, asking t.co alone', async () => {
    const asked: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      asked.push({ url, init });
      return new Response(null, { status: 301, headers: { location: 'https://t0ll.example/' } });
    }) as unknown as typeof fetch;
    expect(await resolveXShortLink('https://t.co/X3ZZQwi2hB', { fetchImpl })).toBe('https://t0ll.example/');
    expect(asked).toHaveLength(1);
    expect(asked[0]!.url).toBe('https://t.co/X3ZZQwi2hB');
    expect(asked[0]!.init).toMatchObject({ method: 'HEAD', redirect: 'manual' });
  });

  it('asks nothing for a link that is not a t.co short link, and refuses odd answers', async () => {
    let calls = 0;
    const answer = (status: number, location?: string) =>
      (async () => {
        calls += 1;
        return new Response(null, { status, headers: location ? { location } : {} });
      }) as unknown as typeof fetch;
    expect(await resolveXShortLink('https://evil.example/t.co/abc', { fetchImpl: answer(301, 'https://x.example/') })).toBeUndefined();
    expect(await resolveXShortLink('https://t.co/abc/def', { fetchImpl: answer(301, 'https://x.example/') })).toBeUndefined();
    expect(calls).toBe(0);
    expect(await resolveXShortLink('https://t.co/X3ZZQwi2hB', { fetchImpl: answer(200) })).toBeUndefined();
    expect(await resolveXShortLink('https://t.co/X3ZZQwi2hB', { fetchImpl: answer(301, 'javascript:alert(1)') })).toBeUndefined();
    expect(await resolveXShortLink('https://t.co/X3ZZQwi2hB', { fetchImpl: answer(301, 'https://t.co/loop1') })).toBeUndefined();
    expect(xShortLinkOf('http://t.co/X3ZZQwi2hB')).toBe('https://t.co/X3ZZQwi2hB');
  });
});
