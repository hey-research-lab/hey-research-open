import { describe, expect, it } from 'vitest';

import { CHAIN_REGISTRY, CHAIN_SLUGS, chainById, configuredRpcUrls, enabledChains, homeChain, isPublicChain } from './chains';
import { ROBINHOOD_CHAIN_ID } from './constants';
import { homeChainIdFromRawEnv, parseServerEnv, safeParseServerEnv } from './env';

/** The chain registry and per-chain settings (multichain WP1.1, 2026-11-11). */
const MINIMAL = { DATABASE_URL: 'postgresql://hey:hey@localhost:5432/hey_research' };

describe('the chain registry', () => {
  it('holds Robinhood Chain as home, and Base and Ethereum, each under its own id and slug', () => {
    expect(CHAIN_SLUGS).toEqual(['robinhood', 'base', 'ethereum']);
    expect(CHAIN_SLUGS.map((slug) => [slug, CHAIN_REGISTRY[slug].id, CHAIN_REGISTRY[slug].slug])).toEqual([
      ['robinhood', ROBINHOOD_CHAIN_ID, 'robinhood'],
      ['base', 8453, 'base'],
      ['ethereum', 1, 'ethereum'],
    ]);
    expect(chainById(4663)?.slug).toBe('robinhood');
    expect(chainById(8453)?.name).toBe('Base');
    expect(chainById(99901)).toBeUndefined();
  });

  it('names Robinhood Chain with the identifiers HEY reads today, and no Bitquery network on a new chain (D12)', () => {
    const home = CHAIN_REGISTRY.robinhood;
    expect([home.dexscreenerSlug, home.geckoterminalNetwork, home.coingeckoPlatform, home.defillamaLabel, home.bitqueryNetwork]).toEqual([
      'robinhood',
      'robinhood',
      'robinhood',
      'Robinhood Chain',
      'robinhood',
    ]);
    expect(CHAIN_REGISTRY.base.bitqueryNetwork).toBeNull();
    expect(CHAIN_REGISTRY.ethereum.bitqueryNetwork).toBeNull();
  });
});

describe('env.chains', () => {
  it('with no new variable set, enables and shows the home chain alone', () => {
    const env = parseServerEnv(MINIMAL);
    expect(enabledChains(env)).toEqual([4663]);
    expect(env.chains.public).toEqual([4663]);
    expect(isPublicChain(env, 4663)).toBe(true);
    expect(isPublicChain(env, 8453)).toBe(false);
  });

  it('keeps env.chain as the home alias: the same object as the home chain settings', () => {
    const env = parseServerEnv({ ...MINIMAL, RH_RPC_URL: 'https://rpc.example' });
    expect(env.chains.settings.robinhood).toBe(env.chain);
    expect(homeChain(env)).toBe(env.chain);
  });

  it('gives other chains their registry id and identifiers, their own nodes and the one shared Blockscout key', () => {
    const env = parseServerEnv({ ...MINIMAL, BASE_RPC_URL: 'https://base.example', ETH_RPC_FALLBACK_URL: 'https://eth.example', RH_BLOCKSCOUT_API_KEY: 'proapi_k' });
    expect(env.chains.settings.base).toEqual({
      chainId: 8453,
      dexscreenerSlug: 'base',
      geckoterminalNetwork: 'base',
      rpcUrl: 'https://base.example',
      rpcFallbackUrl: undefined,
      blockscoutBaseUrl: 'https://base.blockscout.com',
      blockscoutApiKey: 'proapi_k',
    });
    expect(env.chains.settings.ethereum.rpcFallbackUrl).toBe('https://eth.example');
    expect(env.chains.settings.ethereum.geckoterminalNetwork).toBe('eth');
  });

  it('accepts a list with spaces and duplicates, home first', () => {
    const env = parseServerEnv({ ...MINIMAL, HEY_CHAINS_ENABLED: ' 8453 , 4663,8453', HEY_CHAINS_PUBLIC: '4663' });
    expect(env.chains.enabled).toEqual([4663, 8453]);
    expect(env.chains.public).toEqual([4663]);
  });

  it('defaults to the home chain a host names with RH_CHAIN_ID', () => {
    const env = parseServerEnv({ ...MINIMAL, RH_CHAIN_ID: '46630' });
    expect(env.chains.enabled).toEqual([46630]);
    expect(env.chain.chainId).toBe(46630);
  });

  it.each([
    [{ HEY_CHAINS_ENABLED: '4663,99901' }, 'HEY_CHAINS_ENABLED'],
    [{ HEY_CHAINS_ENABLED: 'base' }, 'HEY_CHAINS_ENABLED'],
    [{ HEY_CHAINS_ENABLED: '4663,' }, 'HEY_CHAINS_ENABLED'],
    [{ HEY_CHAINS_PUBLIC: '4663,8453' }, 'HEY_CHAINS_PUBLIC'],
    [{ HEY_CHAINS_ENABLED: '4663,8453', HEY_CHAINS_PUBLIC: '8453' }, 'HEY_CHAINS_PUBLIC'],
    [{ BASE_RPC_URL: 'not a url' }, 'BASE_RPC_URL'],
    [{ ETH_RPC_URL: 'not a url' }, 'ETH_RPC_URL'],
  ])('refuses %o at boot, naming %s', (raw, variable) => {
    const result = safeParseServerEnv({ ...MINIMAL, ...raw });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.variables).toEqual([variable]);
  });

  it('refuses a list that leaves the home chain out, and the home chain shown but not read', () => {
    const result = safeParseServerEnv({ ...MINIMAL, HEY_CHAINS_ENABLED: '8453' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.variables).toEqual(['HEY_CHAINS_ENABLED', 'HEY_CHAINS_PUBLIC']);
      expect(result.issues[0]).toContain('must include the home chain (4663)');
    }
  });
});

describe('homeChainIdFromRawEnv', () => {
  it('reads RH_CHAIN_ID by the parser rule, Robinhood Chain when unset, empty or unreadable', () => {
    expect(homeChainIdFromRawEnv({})).toBe(4663);
    expect(homeChainIdFromRawEnv({ RH_CHAIN_ID: '' })).toBe(4663);
    expect(homeChainIdFromRawEnv({ RH_CHAIN_ID: '46630' })).toBe(46630);
    expect(homeChainIdFromRawEnv({ RH_CHAIN_ID: 'abc' })).toBe(4663);
    expect(homeChainIdFromRawEnv({ RH_CHAIN_ID: ' 4663 ' })).toBe(parseServerEnv({ ...MINIMAL, RH_CHAIN_ID: ' 4663 ' }).chain.chainId);
  });
});

describe('configuredRpcUrls', () => {
  it('names no node for a chain with none configured, so each reader keeps its own default', () => {
    expect(configuredRpcUrls(parseServerEnv(MINIMAL))).toEqual({});
  });

  it('keys the home node under 4663 only, and the other chains under their own ids', () => {
    const env = parseServerEnv({ ...MINIMAL, RH_RPC_URL: 'https://rh.example', BASE_RPC_URL: 'https://base.example', ETH_RPC_URL: 'https://eth.example' });
    expect(configuredRpcUrls(env)).toEqual({ 4663: 'https://rh.example', 8453: 'https://base.example', 1: 'https://eth.example' });
    // A host pointed at another chain (a testnet) never lends its node to a 4663 reader, as before.
    expect(configuredRpcUrls(parseServerEnv({ ...MINIMAL, RH_CHAIN_ID: '46630', RH_RPC_URL: 'https://rh.example' }))).toEqual({});
  });
});
