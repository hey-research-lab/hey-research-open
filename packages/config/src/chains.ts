/**
 * The chains HEY knows (multichain WP1.1, 2026-11-11; CLAUDE.md "Multichain rules (2026-11-11)").
 *
 * Robinhood Chain is HEY's home (D1): every surface's default, and the chain `env.chain` names. The registry below holds
 * each chain's static metadata — its id, slug, name, explorer and the identifiers each market or data provider gives
 * it — and the parsed environment (`env.chains`) holds what a host configures: which chains are enabled, which are
 * public, and each chain's endpoints. `env.chain` stays the typed alias of the home chain's settings, so the readers of
 * `env.chain` are untouched.
 *
 * Phase 1 builds the shape and nothing reads another chain through it: `HEY_CHAINS_ENABLED` and `HEY_CHAINS_PUBLIC`
 * both default to the home chain, and no job, page or answer asks the registry for Base or Ethereum. Their entries are
 * here so the later packages (WP1.4's `chains` table, WP1.10's worker loop) have one place to read; their provider
 * identifiers are re-checked against the providers before a package first reads them (WP2.1). Elysium (99901) is not
 * registered: the plan holds every Elysium line of code until its 30-day measurement is ruled on (D17, PLAN.md §12).
 *
 * This module is pure data and helpers: no environment read, safe for any bundle.
 */
import { ROBINHOOD_CHAIN_ID } from './constants';

export const CHAIN_SLUGS = ['robinhood', 'base', 'ethereum'] as const;
export type ChainSlug = (typeof CHAIN_SLUGS)[number];

/** The home chain's slug (D1). Never moves. */
export const HOME_CHAIN_SLUG = 'robinhood' satisfies ChainSlug;

export const BASE_CHAIN_ID = 8453;
export const ETHEREUM_CHAIN_ID = 1;

export type ChainExplorerKind = 'blockscout' | 'etherscan';

export type ChainMetadata = {
  readonly id: number;
  readonly slug: ChainSlug;
  readonly name: string;
  /** The explorer a person is linked to. Which API HEY reads it through is the explorer adapter's (`explorerApiFor`). */
  readonly explorer: { readonly kind: ChainExplorerKind; readonly url: string };
  /** DEX Screener's chain id in its URLs and API. */
  readonly dexscreenerSlug: string;
  /** GeckoTerminal's network id. */
  readonly geckoterminalNetwork: string;
  /** CoinGecko's asset platform id. */
  readonly coingeckoPlatform: string;
  /** DefiLlama's exact chain label. */
  readonly defillamaLabel: string;
  /** Bitquery's EVM network name; null where HEY does not use Bitquery (no Bitquery on a new chain, D12). */
  readonly bitqueryNetwork: string | null;
};

/**
 * Static metadata per chain. Robinhood's identifiers are the ones HEY reads today (`RH_DEXSCREENER_CHAIN_SLUG` and
 * `RH_GECKOTERMINAL_NETWORK` default to them, `BITQUERY_NETWORK`, `DEFI_LLAMA_CHAIN`, CoinGecko's `robinhood`).
 */
export const CHAIN_REGISTRY: { readonly [S in ChainSlug]: ChainMetadata & { readonly slug: S } } = {
  robinhood: {
    id: ROBINHOOD_CHAIN_ID,
    slug: 'robinhood',
    name: 'Robinhood Chain',
    explorer: { kind: 'blockscout', url: 'https://robinhoodchain.blockscout.com' },
    dexscreenerSlug: 'robinhood',
    geckoterminalNetwork: 'robinhood',
    coingeckoPlatform: 'robinhood',
    defillamaLabel: 'Robinhood Chain',
    bitqueryNetwork: 'robinhood',
  },
  base: {
    id: BASE_CHAIN_ID,
    slug: 'base',
    name: 'Base',
    explorer: { kind: 'blockscout', url: 'https://base.blockscout.com' },
    dexscreenerSlug: 'base',
    geckoterminalNetwork: 'base',
    coingeckoPlatform: 'base',
    defillamaLabel: 'Base',
    bitqueryNetwork: null,
  },
  ethereum: {
    id: ETHEREUM_CHAIN_ID,
    slug: 'ethereum',
    name: 'Ethereum',
    explorer: { kind: 'blockscout', url: 'https://eth.blockscout.com' },
    dexscreenerSlug: 'ethereum',
    geckoterminalNetwork: 'eth',
    coingeckoPlatform: 'ethereum',
    defillamaLabel: 'Ethereum',
    bitqueryNetwork: null,
  },
};

const BY_ID: ReadonlyMap<number, ChainMetadata> = new Map(CHAIN_SLUGS.map((slug) => [CHAIN_REGISTRY[slug].id, CHAIN_REGISTRY[slug]]));

/** A chain's registry entry by its id; undefined for a chain HEY has no entry for. */
export function chainById(id: number): ChainMetadata | undefined {
  return BY_ID.get(id);
}

/**
 * One chain's configured settings: the shape of `env.chain` (the home chain's), in the same key order, so the home
 * chain's entry and the alias are one object.
 */
export type ChainSettings = {
  chainId: number;
  dexscreenerSlug: string;
  geckoterminalNetwork: string;
  rpcUrl?: string | undefined;
  rpcFallbackUrl?: string | undefined;
  blockscoutBaseUrl?: string | undefined;
  blockscoutApiKey?: string | undefined;
};

/** What the chain helpers read of the parsed environment (`ServerEnv` satisfies it). */
export type ChainsEnv = {
  chain: ChainSettings;
  chains: {
    enabled: readonly number[];
    public: readonly number[];
    settings: { readonly [S in ChainSlug]: ChainSettings };
  };
};

/** The home chain's settings: `env.chain` (D1). */
export function homeChain(env: ChainsEnv): ChainSettings {
  return env.chain;
}

/** The chain ids this host reads, the home chain first. `HEY_CHAINS_ENABLED`, default the home chain alone. */
export function enabledChains(env: ChainsEnv): readonly number[] {
  return env.chains.enabled;
}

/** Whether a chain is shown on public surfaces. `HEY_CHAINS_PUBLIC`, default the home chain alone. */
export function isPublicChain(env: ChainsEnv, id: number): boolean {
  return env.chains.public.includes(id);
}

/**
 * The RPC endpoint each chain's settings name, by chain id; a chain with none configured is absent. The home chain is
 * keyed only under Robinhood Chain's own id, so a host pointing `RH_CHAIN_ID` elsewhere (a testnet) never lends its node
 * to a reader that asks for 4663 or for another registered chain. A reader keeps its own default for an absent chain.
 */
export function configuredRpcUrls(env: ChainsEnv): Record<number, string> {
  const urls: Record<number, string> = {};
  for (const slug of CHAIN_SLUGS) {
    if (slug === HOME_CHAIN_SLUG) continue;
    const settings = env.chains.settings[slug];
    if (settings.rpcUrl) urls[settings.chainId] = settings.rpcUrl;
  }
  const home = env.chain;
  if (home.chainId === ROBINHOOD_CHAIN_ID && home.rpcUrl) urls[home.chainId] = home.rpcUrl;
  return urls;
}
