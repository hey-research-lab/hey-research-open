import { PONS_V2_LIFECYCLE_TOPICS } from './pons-lifecycle';

/**
 * Launch factory registry (Discovery Coverage V2 §12).
 *
 * Every on-chain launch source HEY indexes is declared here and nowhere else.
 * Scattering factory addresses through adapters is how a chain-locked product
 * ends up indexing the wrong chain: one stale constant in one service and the
 * mistake is invisible.
 *
 * **Only verified addresses belong here.** Each entry records how it was
 * confirmed, and every address below was checked against chain 4663 — the
 * contract exists, its logs decode to a token this chain actually holds, and
 * the event topic was read from a live log rather than computed from a source
 * declaration (the Pons V2 registry once carried a computed topic that did not
 * match the deployed bytecode).
 */
export type LaunchEventStrings = {
  /**
   * Word index (32-byte slot) in the event data that holds the offset of the
   * dynamic string. Read from a decoded live log, never from an ABI alone.
   */
  name?: number;
  symbol?: number;
  metadataUri?: number;
  imageUri?: number;
};

export type LaunchFactoryConfig = {
  id: string;
  name: string;
  /** Candidate `launchpad` key; the card looks the display name up by it. */
  launchpad: string;
  version?: string;
  chainId: number;
  factoryAddress: `0x${string}`;
  /**
   * Where scanning starts. Robinhood Chain produces ~880k blocks/day, so a
   * genesis-first rescan every run is thousands of wasted requests; sync state
   * persists the resume point separately.
   */
  startBlock: number;
  /** `topics[0]` of the launch event. */
  eventTopic0: `0x${string}`;
  /**
   * Which indexed topic carries the token address, or `'data'` when the event
   * does not index it and it sits in a data word instead (Flap). Verified
   * empirically by reading the contract at that address and confirming it
   * answers `symbol()`.
   */
  tokenTopicIndex: 1 | 2 | 3 | 'data';
  /** Word index of the token address in the data when `tokenTopicIndex` is `'data'`. */
  tokenDataWord?: number;
  /**
   * More `topics[0]` values the same request asks for (2026-10-15): the
   * factory's own lifecycle events after the launch, read as an OR list
   * beside `eventTopic0` so they cost no extra log request. Only a log whose
   * `topics[0]` is `eventTopic0` is ever a launch. Set only where each topic
   * was matched against live logs (Pons V2, `pons-lifecycle.ts`).
   */
  lifecycleTopics?: readonly `0x${string}`[];
  /**
   * The first block the launch scan asks for `lifecycleTopics` too. The node
   * answers an OR list over at most 100,000 blocks against 2M for one topic,
   * so a scan from `startBlock` reads the history before it at the old pace;
   * the lifecycle before it is the backfill's (`pnpm data:pons-lifecycle`).
   */
  lifecycleStartBlock?: number;
  /** Creator-supplied strings the event carries, when it carries any. */
  eventStrings?: LaunchEventStrings;
  enabled: boolean;
  /** How the address and event were confirmed. */
  verification: string;
  sourceUrl: string;
};

/**
 * Pons launch events.
 *
 * Re-verified 2026-09-03 against chain 4663 and the ponsfamily.com frontend
 * bundle, which ships its own deployment list. Two generations, two event
 * signatures:
 *
 * - V1 `TokenLaunched(address indexed token, address indexed deployer, address
 *   indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256
 *   launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256
 *   initialBuyAmount)` → topic `0xdb51ea9a…`, token in `topics[1]`.
 * - V2 launch event → topic `0x8d4aad49…`, three indexed fields, token in
 *   `topics[1]`. Read from live logs; the published declaration hashes to a
 *   different value (see the constant below).
 *
 * The earlier registry looked for the wrong topic on the published V1 address
 * and concluded it emitted no launch event, and pointed V2 at a superseded
 * deployment; the factory that carries essentially all current launches
 * (`0x7eD598…`, roughly forty launches per thousand blocks) was not indexed
 * at all.
 */
const PONS_V1_LAUNCH_TOPIC0 =
  '0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a' as const;
/**
 * Read from the chain, not computed from the published source: the deployed
 * factory's launch event hashes differently from the repository's
 * `TokenLaunched` declaration (the source is newer than the bytecode). It is
 * the event with three indexed fields whose `topics[1]` is a token that
 * answers `launchFactory()` with this factory — 127 of them in one 3,000-block
 * window on 2026-09-03.
 */
const PONS_V2_LAUNCH_TOPIC0 =
  '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607' as const;
/**
 * The earlier V2 deployment emits the same launch event as the current one
 * (2026-10-15). This entry carried `0xbd886f85…`, which is
 * keccak256("BuybackEnabledUpdated(address,bool,address)") — a setting
 * change, not a launch — so the 1,044 `TokenLaunched` (`0x8d4aad49…`) it
 * emitted between 2026-07-31 and 2026-08-01 were never read: no candidate
 * has `discovered_via = 'PONS_V2_EARLY'`. The hourly scan's resume block for
 * this factory is already past them, so they are read once by the recovery
 * tool (README, "Pons V2 launch lifecycle"):
 *
 *   pnpm --filter @hey/worker data:rescan-launchpads --factory PONS_V2_EARLY --from-block 0 --to-block <head> --dry-run
 */
const PONS_V2_EARLY_LAUNCH_TOPIC0 = PONS_V2_LAUNCH_TOPIC0;

/**
 * Robinlaunch (robinlaunch.fun) — bonding-curve memecoin launcher graduating
 * to Uniswap V3. Its bundle (`7274d007107e.js`, `ALL_FACTORY_VERSIONS` /
 * `ALL_DIRECT_FACTORY_VERSIONS`) lists every deployment; each was censused on
 * 2026-09-03 and only the ones that emitted a launch are enabled.
 *
 * - Bonding factories emit `TokenCreated(address indexed creator, address
 *   indexed token, address indexed curve, string name, string symbol, string
 *   metadataURI, uint256 index)` → topic `0x463df9e0…`, token in `topics[2]`,
 *   name/symbol/URI in data words 0/1/2.
 * - Direct-pool and boost factories emit `TokenLaunched(address indexed
 *   creator, address indexed token, address indexed pool, string name, string
 *   symbol, string metadataURI, uint256 index, uint256 initialEth, uint256
 *   tokenId)` → topic `0x88401197…`, same positions.
 * - Presale factories emit `PresaleCreated` with no token in the topics (the
 *   token exists only once a presale finalises) and are not indexed.
 */
const ROBINLAUNCH_CREATED_TOPIC0 =
  '0x463df9e040f1a9181ece2287496672134faffc6e35d4118f691d4280c8a68ee1' as const;
const ROBINLAUNCH_LAUNCHED_TOPIC0 =
  '0x8840119748b379f269aa727e75743406d8d9d5ea147b94d8f9a3dee251ff15eb' as const;
const ROBINLAUNCH_STRINGS: LaunchEventStrings = { name: 0, symbol: 1, metadataUri: 2 };
const ROBINLAUNCH_SOURCE = 'https://robinlaunch.fun/';

const robinlaunch = (
  entry: Pick<LaunchFactoryConfig, 'id' | 'version' | 'factoryAddress' | 'startBlock' | 'verification'> & {
    kind: 'bonding' | 'direct';
  },
): LaunchFactoryConfig => ({
  id: entry.id,
  name: 'Robinlaunch',
  launchpad: 'robinlaunch',
  ...(entry.version ? { version: entry.version } : {}),
  chainId: 4663,
  factoryAddress: entry.factoryAddress,
  startBlock: entry.startBlock,
  eventTopic0: entry.kind === 'bonding' ? ROBINLAUNCH_CREATED_TOPIC0 : ROBINLAUNCH_LAUNCHED_TOPIC0,
  tokenTopicIndex: 2,
  eventStrings: ROBINLAUNCH_STRINGS,
  enabled: true,
  verification: entry.verification,
  sourceUrl: ROBINLAUNCH_SOURCE,
});

/**
 * hood.fun's launch event, emitted by its main launchpad and by the
 * "community" launchpad the board's `launchpad` field names for two launches.
 * Read from live logs on 2026-09-03 (CLIMB) and 2026-09-05 (Robin, FEATHER).
 */
const HOODFUN_LAUNCH_TOPIC0 =
  '0x91de26bc430b3a4f1d6cfb11d72f2e5ca75d7622d37b2a88a8998ec28e747a11' as const;

/**
 * Flap's first launch is at block 4,227,932 (tx 0x4d662a37…, token
 * 0xd7b1a493…7777 answering name() "TestToken"), found on 2026-09-05 by an
 * `eth_getLogs` census walking back from 30M in 250k-block windows until one
 * was empty and forward again from genesis: no launch in 0–4.2M, one in the
 * 4.0–4.25M window, then a trickle to ~5.2M and ~1,800 per 250k blocks from
 * there. 71,914 launches sit between 5.19M and 15M — the range the earlier
 * 15M start never covered — and ~177,600 between 5.19M and 30M.
 */
const FLAP_START_BLOCK = 4_220_000;

/** o1 Launchpad's factory generations (census 2026-11-13): one launch event, the token in topics[1]. */
function o1Factories(): LaunchFactoryConfig[] {
  const LAUNCHED = '0x207384e895174175cc774fe7f7457b37c382f27ebf53d37d5257b862f80eaf9c' as const;
  const entry = (id: string, version: string, factoryAddress: `0x${string}`, startBlock: number, verification: string): LaunchFactoryConfig => ({
    id,
    name: 'o1 Launchpad',
    launchpad: 'o1',
    version,
    chainId: 4663,
    factoryAddress,
    startBlock,
    eventTopic0: LAUNCHED,
    tokenTopicIndex: 1,
    enabled: true,
    verification,
    sourceUrl: 'https://github.com/o1exchange/o1-launch',
  });
  return [
    entry('O1_V4', 'v4', '0xce9c48cfa068947f77738c81be406b53338e5b0d', 51_950_000,
      'Sourcify exact match for src/RWAERC20LaunchpadFactory.sol, 24,466 bytes; Launched hashes to this topic; 4,263 launches 51,960,302–108,174,164; Habibi (0xab5ff4bc…) in topics[1] answers symbol() (census 2026-11-13)'),
    entry('O1_V4_RWA', 'v4 rwa', '0xe64ac4113848bbc1a6dde1a6d1da96720a36f297', 19_570_000,
      'Sourcify exact match for RWAERC20LaunchpadFactory, 21,680 bytes; 3,221 launches 19,576,924–52,782,006; a token at 0xefab1bdd… answers symbol() (census 2026-11-13)'),
    entry('O1_V3', 'v3', '0x411f21283d3e492bc395027329e08f9f4f560ba5', 6_440_000,
      'ERC20LaunchpadFactory (o1 suite robinhood-timestamp-v3), 20,103 bytes; 1,681 launches 6,447,260–52,779,684; TTT (0x17ade8c1…) answers symbol() (census 2026-11-13)'),
    entry('O1_V2', 'v2', '0x76f0923ac4df0a079a10f628a7bce6426ccd344a', 4_450_000,
      'ERC20LaunchpadFactory (o1 suite robinhood-block-v2), 18,612 bytes; 105 launches 4,456,282–6,266,298; JV2 (0x25f581ee…) answers symbol() (census 2026-11-13)'),
    entry('O1_TAX', 'tax', '0x29cad997f3cf1aa9ca51e12be29c09e3e00f119a', 75_340_000,
      'Sourcify match for src/tax/TaxRWAERC20LaunchpadFactory.sol; 123 launches 75,345,541–109,237,680 (census 2026-11-13)'),
    // The second tax factory: o1's launchpad launches taxed tokens through it (founder, 2026-11-13). clanker.world's API
    // also lists its tokens (`type: clanker_tax`), which named it as a question, not an operator.
    entry('O1_TAX_2', 'tax', '0xca111dcdd2ce924c3378d6514fdcbc46217bca16', 107_070_000,
      'Sourcify match for TaxRWAERC20LaunchpadFactory, the same Launched topic as the other o1 factories; 78 launches 107,075,812–112,868,845 (census 2026-11-13); o1 Launchpad\'s taxed launches (founder, 2026-11-13)'),
  ];
}

/**
 * Pangea (pangea.trade), added 2026-11-13. Its hook 0x15e5…a8cc lists these factories in its own on-chain `factories()`,
 * the newest (UniswapLaunchFactoryV3, verified "Pangea launch factory v3") was deployed by the key Pangea's hook
 * repository calls its admin key, and Uniswap's hooklist files the hook as Pangea's (issue #10582). Every generation
 * but v4 emits `Launched(bytes32 indexed launchId, address indexed token, …)`, the token in topics[2]; v4 (an ERC-1967
 * proxy) emits `Opened(bytes32 indexed coinId, address indexed token, address indexed by, …)`, the token in topics[2].
 * No name or ticker in either event.
 */
function pangeaFactories(): LaunchFactoryConfig[] {
  const LAUNCHED = '0xa78f3d87c4613e7251332c9838de9161121bcf0e9af64410ddc341caacdc9090' as const;
  const OPENED = '0xbdca3fcdb296a15c842ff17efa2156eea58d30d1f6ca44c2b3ab375503e540ca' as const;
  const entry = (id: string, version: string, factoryAddress: `0x${string}`, startBlock: number, eventTopic0: `0x${string}`, verification: string): LaunchFactoryConfig => ({
    id,
    name: 'Pangea',
    launchpad: 'pangea',
    version,
    chainId: 4663,
    factoryAddress,
    startBlock,
    eventTopic0,
    tokenTopicIndex: 2,
    enabled: true,
    verification,
    sourceUrl: 'https://www.pangea.trade/',
  });
  return [
    entry('PANGEA_V1', 'v1', '0x7808344fc0a43e6a5d0e9cb565a13ef9618d61b5', 90_030_000, LAUNCHED, 'in the Pangea hook\'s factories(); creator named in its README; 2 launches 90,039,766–90,082,908 (census 2026-11-13)'),
    entry('PANGEA_V1B', 'v1', '0x8a1f3e1db07048c007f6d9ab924494c77c0dba65', 92_490_000, LAUNCHED, 'in the Pangea hook\'s factories(); 335 launches 92,497,513–96,868,500 (census 2026-11-13)'),
    entry('PANGEA_V2', 'v2', '0xadf9c12eaf14da2f7780c0587cc06034f1edf8d3', 96_910_000, LAUNCHED, 'UniswapLaunchFactoryV2 in the Pangea hook\'s factories(); 362 launches 96,917,992–98,854,271 (census 2026-11-13)'),
    entry('PANGEA_V2B', 'v2', '0x9cf5832474cbb09d2e06ff20460aff4303faf72a', 98_860_000, LAUNCHED, 'UniswapLaunchFactoryV2 in the Pangea hook\'s factories(); 321 launches 98,869,582–104,462,691 (census 2026-11-13)'),
    entry('PANGEA_V3', 'v3', '0xaa7a943666b72a305a53962dd5b28c5f9d8a37a7', 104_470_000, LAUNCHED, 'verified UniswapLaunchFactoryV3 ("Pangea launch factory v3"), deployed by Pangea\'s admin key 0x93620a4A…; 384 launches 104,480,009–112,864,791 (census 2026-11-13)'),
    entry('PANGEA_V4', 'v4', '0x9a8b8d44ba267b2be3c5dc8a8cae173870458e9b', 112_740_000, OPENED, 'ERC-1967 proxy in the Pangea hook\'s factories(); Opened events, tokens ending 6ea as Pangea\'s v4 docs say; 5 launches 112,747,839–112,764,099 (census 2026-11-13)'),
  ];
}

export const LAUNCH_FACTORIES: readonly LaunchFactoryConfig[] = [
  {
    id: 'PONS_V2',
    name: 'Pons',
    launchpad: 'pons',
    version: 'V2',
    chainId: 4663,
    factoryAddress: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
    startBlock: 0,
    eventTopic0: PONS_V2_LAUNCH_TOPIC0,
    tokenTopicIndex: 1,
    // LaunchSwept, PoolGraduated, GraduationTokensPermanentlyLocked (2026-10-15), in the same request,
    // from a few hours before the chain head of 2026-10-15 (89,244,341); everything earlier is the backfill's.
    lifecycleTopics: PONS_V2_LIFECYCLE_TOPICS,
    lifecycleStartBlock: 89_000_000,
    enabled: true,
    verification:
      'ponsfamily.com bundle (getPonsV2BrowserFactoryAddress) and official README; 24,177 bytes on 4663; launch topic read from live logs (127 launches in 3,000 blocks on 2026-09-03), and their tokens answer launchFactory() with this address; lifecycle topics matched against live logs on 2026-10-15 (fixtures/pons-v2-lifecycle-logs.json)',
    sourceUrl: 'https://github.com/ponsdotdev/ponsfamily',
  },
  {
    id: 'PONS_V2_EARLY',
    name: 'Pons',
    launchpad: 'pons',
    version: 'V2',
    chainId: 4663,
    factoryAddress: '0x7E1EAbd52Ae29598e6483F72dCf1a70b14284dB8',
    startBlock: 0,
    eventTopic0: PONS_V2_EARLY_LAUNCH_TOPIC0,
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'earlier V2 deployment listed in the ponsfamily.com bundle; 22,757 bytes; topics[1] of a sample event answered symbol() as RYAN; no launches after 2026-09; launch topic corrected 2026-10-15 from BuybackEnabledUpdated (0xbd886f85…) to the TokenLaunched it emitted 1,044 times on 2026-07-31–08-01 (0x8d4aad49…, live Bitquery read)',
    sourceUrl: 'https://github.com/ponsdotdev/ponsfamily',
  },
  {
    id: 'PONS_V1',
    name: 'Pons',
    launchpad: 'pons',
    version: 'V1',
    chainId: 4663,
    factoryAddress: '0xF4fC0CD27fC8EcF17E55eE4c3f7201897dF3eb75',
    startBlock: 0,
    eventTopic0: PONS_V1_LAUNCH_TOPIC0,
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'the V1 factory the ponsfamily.com v1 tab launches through (bundle: getPonsV15LaunchpadDeployment); EIP-1967 proxy, launchEnabled() true; launched tokens answer launchFactory() with this address',
    sourceUrl: 'https://ponsfamily.com/launchpad/create',
  },
  {
    id: 'PONS_V1_PUBLISHED',
    name: 'Pons',
    launchpad: 'pons',
    version: 'V1',
    chainId: 4663,
    factoryAddress: '0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB',
    startBlock: 0,
    eventTopic0: PONS_V1_LAUNCH_TOPIC0,
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'the V1 address in the official repository; 24,353 bytes; launchEnabled() false since 2026-08; TokenLaunched logs around block 34.79M decode to ERC-20s (TOAD) whose position NFT the locker owns',
    sourceUrl: 'https://github.com/ponsdotdev/ponsfamily',
  },
  {
    id: 'PONS_V1_LEGACY',
    name: 'Pons',
    launchpad: 'pons',
    version: 'V1',
    chainId: 4663,
    factoryAddress: '0x0c37a24F5D23A486FA692d1500881d698B1F77a4',
    startBlock: 0,
    eventTopic0: PONS_V1_LAUNCH_TOPIC0,
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'legacy V1 factory in the ponsfamily.com bundle; 24,192 bytes; the $PONS token itself answers getLaunchedToken() here',
    sourceUrl: 'https://github.com/ponsdotdev/ponsfamily',
  },

  /* ------------------------------------------------------------ 2026-09-04 */

  /**
   * Pools (pools.trade) — Uniswap Labs' Robinhood Chain launchpad. Every launch
   * goes through one `LiquidityLauncher`, whichever strategy (instant launch or
   * a Continuous Clearing Auction) the creator picked, and the launcher emits a
   * one-topic event with the token address once the token is minted to it. The
   * event carries no name: identity comes from the token's own `name()` /
   * `symbol()` in a bounded pass.
   */
  {
    id: 'POOLS_TRADE',
    name: 'Pools',
    launchpad: 'poolstrade',
    chainId: 4663,
    factoryAddress: '0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0',
    startBlock: 28_520_000,
    eventTopic0: '0x2e2b3f61b70d2d131b2a807371103cc98d51adcaa5e9a8f9c32658ad8426e74e',
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'the LiquidityLauncher in the pools.trade bundle (assets/080771da48f7.js, the "full 4663 stack redeploy, current" strategies point at it); 4,127 bytes on 4663; launch tx 0x4a78f10a… mints TACOS (0x78c59d4c…) to it and it emits this topic with the token in topics[1]; 40,306 such logs from the first at block 28,520,117 to 40M and 10,382 from 40M to 53.1M on 2026-09-03; sampled topics[1] answer symbol() TACOS, UNIFROG, CTHUWU',
    sourceUrl: 'https://pools.trade/',
  },

  /**
   * hood.fun — fair-launch bonding curves. One launchpad contract emits the
   * launch event with the token in `topics[1]`, the creator in `topics[2]`, and
   * the name, ticker and an inline-JSON `metadataURI` (description, links,
   * sometimes a base64 image) in the data.
   */
  {
    id: 'HOODFUN',
    name: 'hood.fun',
    launchpad: 'hoodfun',
    chainId: 4663,
    factoryAddress: '0x8c529f0a77c07ce0e6796f153d292501ee6f66f6',
    startBlock: 6_150_000,
    eventTopic0: HOODFUN_LAUNCH_TOPIC0,
    tokenTopicIndex: 1,
    eventStrings: { name: 0, symbol: 1, metadataUri: 2 },
    enabled: true,
    verification:
      'LAUNCHPAD_ADDRESS in the hood.fun bundle (38b2c66fdda9.js); 23,208 bytes on 4663; the launch of CLIMB (block 52,848,167, tx 0x7005bca9…) emits this topic with the token in topics[1] and "Climb Net" / "CLIMB" / inline JSON in data words 0/1/2; hood.fun/api/board lists 352 launches through it (first at block 6,151,910) on 2026-09-03',
    sourceUrl: 'https://hood.fun/',
  },
  {
    id: 'HOODFUN_COMMUNITY',
    name: 'hood.fun',
    launchpad: 'hoodfun',
    version: 'community',
    chainId: 4663,
    factoryAddress: '0x5Fcc1DF0dC020CF454e742E9a8Ae2554C37A452C',
    startBlock: 6_150_000,
    eventTopic0: HOODFUN_LAUNCH_TOPIC0,
    tokenTopicIndex: 1,
    eventStrings: { name: 0, symbol: 1, metadataUri: 2 },
    enabled: true,
    verification:
      'the second launchpad hood.fun/api/board names (`launchpad` on its two community launches, isCommunity); 20,518 bytes on 4663; censused 2026-09-05 with eth_getLogs around each launch\'s createdAtBlock: block 6,151,910 (tx 0xc280d098…) and block 7,523,403 (tx 0xd015d2ef…) each emit the main launchpad\'s topic with the token in topics[1] and name / symbol / inline-JSON metadata in data words 0/1/2; the tokens answer symbol() "robin" (name "Robin", 0x67AF360b…) and "FEATHER" (0x72081aDC…); the FEATHER log is saved as fixtures/hoodfun-community-launch.json',
    sourceUrl: 'https://hood.fun/',
  },
  /**
   * hood.fun's first launchpad (coverage audit, 2026-09-30). `HOODFUN_LAUNCHPADS`
   * in the curve adapter always listed it, but no scan read it: its 85 launches
   * (blocks 2,790,789–6,136,207, before the main launchpad took over at
   * 6,151,910) were missing from HEY entirely — 84 of 85 not even a candidate.
   */
  {
    id: 'HOODFUN_LEGACY',
    name: 'hood.fun',
    launchpad: 'hoodfun',
    version: 'legacy',
    chainId: 4663,
    factoryAddress: '0x6a63d96ef77ae569fcb85934cf1bd1ec7fe9b33d',
    startBlock: 2_780_000,
    eventTopic0: HOODFUN_LAUNCH_TOPIC0,
    tokenTopicIndex: 1,
    eventStrings: { name: 0, symbol: 1, metadataUri: 2 },
    enabled: true,
    verification:
      'the first address in HOODFUN_LAUNCHPADS (hoodfun-curve.ts); census 2026-09-30 with eth_getLogs over blocks 0–75.9M: 85 logs of the main launchpad\'s topic 0x91de26bc… between blocks 2,790,789 and 6,136,207, token in topics[1], name / symbol / URI in data words 0/1/2 — the first (tx 0x1589babd…) launched "HOOD lrfnypvk" / "HOOD" (0xce215543…600d); the log is saved as fixtures/hoodfun-legacy-launch.json',
    sourceUrl: 'https://hood.fun/',
  },

  /* Robinlaunch bonding-curve factories, oldest first; each censused 2026-09-03. */
  robinlaunch({
    id: 'ROBINLAUNCH_V4',
    version: 'V4',
    kind: 'bonding',
    factoryAddress: '0x0889B4Cbbb5A8cA2A722734c147fD5A8d956D863',
    startBlock: 5_420_000,
    verification:
      'ALL_FACTORY_VERSIONS version 4 in the bundle; 14,287 bytes; 5 TokenCreated logs (blocks 5.42M–6.35M); the first names ROBINLAUNC (0xC3F6c203…), which the curve API also lists',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_V5',
    version: 'V5',
    kind: 'bonding',
    factoryAddress: '0x511CF20f3c794bDf95be18d93a0F1539919Ba8Fa',
    startBlock: 6_890_000,
    verification: 'version 5 in the bundle; 6 TokenCreated logs (6.90M–7.80M), e.g. CASHBACK',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_V6',
    version: 'V6',
    kind: 'bonding',
    factoryAddress: '0xB6eB41B28bd96461D9a97954920823a8b7042Af0',
    startBlock: 8_010_000,
    verification: 'version 6 in the bundle; 1 TokenCreated log (BANG, block 8,012,969)',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_V7',
    version: 'V7',
    kind: 'bonding',
    factoryAddress: '0xa4552a787ea97649568adcf82e258b714d8affd4',
    startBlock: 8_390_000,
    verification: 'version 7 in the bundle; 1 TokenCreated log (SIRIUS, block 8,393,442)',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_V8',
    version: 'V8',
    kind: 'bonding',
    factoryAddress: '0x108eB6D67c079bEb1EF328850a88c2BbDB4617ea',
    startBlock: 9_200_000,
    verification: 'version 8 in the bundle; 9 TokenCreated logs (9.20M–12.90M), e.g. SOONBRO',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_V9',
    version: 'V9',
    kind: 'bonding',
    factoryAddress: '0xaA9DcD9e246B710723eBE8D3ee947Ff04A29C3D1',
    startBlock: 14_740_000,
    verification: 'version 9 in the bundle; 3 TokenCreated logs (14.75M–15.12M), e.g. RHMCP',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_V10',
    version: 'V10',
    kind: 'bonding',
    factoryAddress: '0xB28c17B72538741590a3374127f84F79B59bBF30',
    startBlock: 15_430_000,
    verification: 'version 10 in the bundle; 4 TokenCreated logs (15.44M–15.54M), e.g. NEXTBETY',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_V11',
    version: 'V11',
    kind: 'bonding',
    factoryAddress: '0x4FB5057634f3CAE0B400E753852ea12B5d6278e2',
    startBlock: 17_610_000,
    verification: 'version 11 in the bundle; 4 TokenCreated logs (17.62M–33.37M), e.g. BLINDPIG',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_V12',
    version: 'V12',
    kind: 'bonding',
    factoryAddress: '0x700Da3295617Ec0c856CF303f77145298c1D4994',
    startBlock: 33_500_000,
    verification:
      'version 12, the bonding factory the app launches through today (NEXT_PUBLIC_MAINNET_FACTORY_V12); 20,438 bytes; 3 TokenCreated logs (33.50M–51.52M), e.g. HORACE',
  }),
  /* Robinlaunch direct-pool and boost factories: TokenLaunched. */
  robinlaunch({
    id: 'ROBINLAUNCH_DIRECT_V4',
    version: 'direct V4',
    kind: 'direct',
    factoryAddress: '0x52afeBDb95Cda3C221eB415Abb9cEE051E3Ca082',
    startBlock: 9_260_000,
    verification: 'direct factory in the bundle; 4 TokenLaunched logs (9.26M–12.15M), e.g. TWEWU',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_DIRECT_V6',
    version: 'direct V6',
    kind: 'direct',
    factoryAddress: '0x45E213F086d721Ac8BAacF6875940a278399c994',
    startBlock: 9_100_000,
    verification: 'direct factory in the bundle; 1 TokenLaunched log (GOLDFISH, block 9,105,474)',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_DIRECT_V7',
    version: 'direct V7',
    kind: 'direct',
    factoryAddress: '0xFE9868fB08D4AF99f37C83839F87183B6Ea1783a',
    startBlock: 15_670_000,
    verification: 'direct factory in the bundle; 2 TokenLaunched logs (15.67M–15.69M), e.g. FCAT',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_DIRECT_V8',
    version: 'direct V8',
    kind: 'direct',
    factoryAddress: '0xB76bd3a49e46399Df323DC06BebCEe2DBd346230',
    startBlock: 15_710_000,
    verification: 'direct factory in the bundle; 13 TokenLaunched logs (15.71M–30.61M), e.g. DEV',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_DIRECT_V9',
    version: 'direct V9',
    kind: 'direct',
    factoryAddress: '0xF3b3E2A751f5891B42B31B0c0044ee90bb2FE079',
    startBlock: 33_520_000,
    verification:
      'the current direct factory (NEXT_PUBLIC_DIRECT_FACTORY_V9); 3 TokenLaunched logs (33.52M–42.25M), e.g. FAUX0N',
  }),
  robinlaunch({
    id: 'ROBINLAUNCH_BOOST',
    version: 'boost',
    kind: 'direct',
    factoryAddress: '0x9F1A2556015c29d8853A6289Afa840359abaC6fF',
    startBlock: 27_730_000,
    verification:
      'BOOST_FACTORY_ADDRESS in the bundle; 16 TokenLaunched logs (27.74M–43.15M), e.g. KO; token in topics[2]',
  }),

  /**
   * PAIR (pair.fund) — multipool RWA launchpad pairing a new token with a
   * basket of tokenized stocks. The launcher's per-launch event carries the
   * token in `topics[1]`, the creator in `topics[2]` and a metadata URL in the
   * data, but no name or ticker; those come from the `pairfund` API adapter or
   * the token contract.
   */
  {
    id: 'PAIR_FUND',
    name: 'PAIR',
    launchpad: 'pairfund',
    chainId: 4663,
    factoryAddress: '0x8660A7F019C7943b0b0A91B8E39AFf3b6DB6Ae62',
    startBlock: 45_580_000,
    eventTopic0: '0x82a616e6f1d0903efaaacd5eb1b62949412287562a5d8fee347dff4b1775f7cf',
    tokenTopicIndex: 1,
    eventStrings: { metadataUri: 3 },
    enabled: true,
    verification:
      'the launcher the pair.fund bundle calls launchTokenMulti on (Qr in 7a3dac3dff82.js); 145-byte proxy on 4663; the RICHCAT launch (tx 0xca70bc3d…, the launchTxHash the API reports) emits this topic with the token in topics[1] and the metadata URL in data word 3; 1,474 such logs from block 45,583,639 to 53.14M on 2026-09-03 against 1,446 tokens in /api/tokens',
    sourceUrl: 'https://pair.fund/',
  },

  /**
   * Clanker on Robinhood Chain. `TokenCreated(address msgSender, address
   * indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string
   * tokenName, string tokenSymbol, string tokenMetadata, string tokenContext,
   * …)`: the metadata string is JSON with a description and social URLs.
   */
  {
    id: 'CLANKER_V4',
    name: 'Clanker',
    launchpad: 'clanker',
    version: 'v4',
    chainId: 4663,
    factoryAddress: '0xD3f2cC1731b7Fd17f28798835C2E02f0a1839A94',
    startBlock: 4_576_000,
    eventTopic0: '0x9299d1d1a88d8e1abdc591ae7a167a6bc63a8f17d695804e9091ee33aa89fb67',
    tokenTopicIndex: 1,
    eventStrings: { imageUri: 1, name: 2, symbol: 3, metadataUri: 4 },
    enabled: true,
    verification:
      'factory_address reported by clanker.world/api/tokens?chainId=4663 for CATARM, whose launch tx 0x1664f046… emits this topic with the token in topics[1] and image / "CATARM" / "CATARM" / metadata JSON in data words 1–4; 14,898 TokenCreated logs from block 4,576,116 to 52.95M on 2026-09-03 (the API counts 5,954)',
    sourceUrl: 'https://www.clanker.world/',
  },

  /**
   * Long.xyz on Robinhood Chain: tokens paired with tokenized stocks. The
   * launch event carries the token twice in the topics, the paired stock
   * third, and only the ticker in the data (word 5); the name is read from
   * the contract.
   *
   * Relabelled 2026-09-30 (coordinator, under founder delegation). This entry
   * was labelled Bankr after GeckoTerminal's venue name; the contract's own
   * verified source says otherwise: Sourcify holds an exact match for
   * `src/LongLauncher.sol:LongLauncher` at this address, and the second
   * emitter of the same event is a proxy onto `LongLaunchFactory` (below).
   * Bankr's own docs name no launcher on Robinhood Chain — they describe
   * Doppler launches, which HEY reads as an unlabelled intake
   * (`DOPPLER_AIRLOCK`, dex-pools.ts). The id stays `BANKR`: it keys this
   * factory's scan position and every record it wrote; it is not a label.
   */
  {
    id: 'BANKR',
    name: 'Long.xyz',
    launchpad: 'long',
    chainId: 4663,
    factoryAddress: '0x22e99278308b393ea1260859b181ad7e78f5eeed',
    startBlock: 8_658_000,
    eventTopic0: '0xadc6f1f726f7c710f77ec06adc75f3bb964e5be19581b072c67f7b9b4039267b',
    tokenTopicIndex: 1,
    eventStrings: { symbol: 5 },
    enabled: true,
    verification:
      'Sourcify exact match for src/LongLauncher.sol:LongLauncher at this address (read 2026-09-30); the contract JOHNDOG (0x64bcf4aa…) was launched through it (tx 0x6773a589…): it emits this topic with the token in topics[1] and "JOHNDOG" in data word 5; 17,629 such logs from block 8,658,626 to 53.15M on 2026-09-03 (lower bound: some windows were rate-limited); no launch in the last 20,000 blocks on 2026-09-30, after the factory below took over',
    sourceUrl: 'https://long.xyz/',
  },
  /**
   * Long.xyz's newer token factory (2026-09-30): a proxy whose implementation
   * `0x7b7b87fd…73d9` is a Sourcify exact match for
   * `src/LongLaunchFactory.sol:LongLaunchFactory`. The same event and layout
   * as the launcher above, which it replaced from block 56.2M.
   */
  {
    id: 'LONG_FACTORY',
    name: 'Long.xyz',
    launchpad: 'long',
    chainId: 4663,
    factoryAddress: '0x1Eef016F22A943abC7DD11422EDeE9D235942104',
    startBlock: 56_220_000,
    eventTopic0: '0xadc6f1f726f7c710f77ec06adc75f3bb964e5be19581b072c67f7b9b4039267b',
    tokenTopicIndex: 1,
    eventStrings: { symbol: 5 },
    enabled: true,
    verification:
      'a 163-byte ERC-1967 proxy onto 0x7b7b87fd1fb05864cd572c7306038552286c73d9, a Sourcify exact match for src/LongLaunchFactory.sol:LongLaunchFactory (read 2026-09-30); first launch at block 56,227,839 (tx 0xc91cf3dc…) carries SPOOK (0x5ed20e6c…1e18) in topics[1], which answers symbol(); nothing in the 100,000 blocks before; 34,534 launches, 32,430 not in HEY (census 2026-09-30)',
    sourceUrl: 'https://long.xyz/',
  },

  /**
   * EasyA Kickstart on Robinhood Chain. The launch event carries the token in
   * `topics[1]`, the creator in `topics[2]`, and name / symbol / an `ipfs://`
   * image in data words 2/3/4.
   */
  {
    id: 'EASYA_KICKSTART',
    name: 'EasyA Kickstart',
    launchpad: 'easya-kickstart',
    chainId: 4663,
    factoryAddress: '0x519fd71f5df8242fb8bccaa346ea5b20c336273e',
    startBlock: 44_090_000,
    eventTopic0: '0x7b3d31f5a245ede42482550606e43f2e8a15d059c4f7fb1480d8ed15f1e3318a',
    tokenTopicIndex: 1,
    eventStrings: { name: 2, symbol: 3, imageUri: 4 },
    enabled: true,
    verification:
      'the contract SUMI (0x81b8a79e…, GeckoTerminal dex easya-kickstart-robinhood) was launched through (tx 0x5fb7cb36…, block 52,455,103): it emits this topic with the token in topics[1] and "SUMI" / "SUMI" / ipfs://… in data words 2–4; 227 such logs from block 44,093,336 to 52.89M on 2026-09-03',
    sourceUrl: 'https://www.easya.io/',
  },

  /**
   * NOXA Fun's first factory, `LaunchFactoryV1` — the chain's earliest launcher, a Pons-V1-style factory. GeckoTerminal
   * names its pools `hoodit`, NOXA's old name (founder, 2026-11-13; the robinhood-chain-resources archive names the
   * address NOXA Fun's LaunchFactoryV1). The id and the stored launchpad key stay `HOODIT` / `hoodit`, so every row
   * written under them reads as before; only the name shown changes. Same `TokenLaunched` signature as Pons V1; 21,443
   * launches between blocks 61,869 and 6,718,684 and none since, so once backfilled it costs one request an hour.
   */
  {
    id: 'HOODIT',
    name: 'NOXA Fun',
    launchpad: 'hoodit',
    chainId: 4663,
    factoryAddress: '0xd9ec2db5f3d1b236843925949fe5bd8a3836fccb',
    startBlock: 61_000,
    eventTopic0: PONS_V1_LAUNCH_TOPIC0,
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'the contract CASHCAT (0x020bfc65…, GeckoTerminal dex hoodit) was launched through (tx 0x0e6d23f0…, block 88,836): it emits the Pons V1 TokenLaunched topic with the token in topics[1] and the Uniswap V3 factory in topics[3]; 21,443 such logs from block 61,869 to 6,718,684 on 2026-09-03 (some windows rate-limited)',
    sourceUrl: 'https://fun.noxa.fi/',
  },

  /**
   * Robinpad (robinpad.app) — "AI, RWA & perp backed launchpad". No public
   * read API; its bundle (`eba139d710a8.js`, `RH4663`) names every factory
   * on 4663 and each was censused on 2026-09-03. Four creation events, none
   * carrying a name: `TokenCreated(address indexed token, address indexed
   * creator, address rewardToken, uint256 threshold)` on the reflection
   * factories, `InstantTokenCreated(address indexed token, address indexed
   * creator, …)` on the instant ones, and two on the main factory. Sampled
   * `topics[1]` all answer `symbol()` (ROBIN, VLAD, APPO, FATVLAD, TESTYSPY).
   */
  ...robinpadFactories(),

  /**
   * Flap (flap.sh) on Robinhood Chain — the launcher its bundle points every
   * chain-4663 launch at. Its launch event indexes nothing: the token address
   * is data word 3 (every Flap token ends in `7777`), the name and ticker are
   * words 4 and 5, and word 6 is a bare IPFS CID for the artwork.
   */
  {
    id: 'FLAP',
    name: 'Flap',
    launchpad: 'flap',
    chainId: 4663,
    factoryAddress: '0x26605f322f7ff986f381bb9a6e3f5dab0beaeb09',
    startBlock: FLAP_START_BLOCK,
    eventTopic0: '0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603',
    tokenTopicIndex: 'data',
    tokenDataWord: 3,
    eventStrings: { name: 4, symbol: 5 },
    enabled: true,
    verification:
      'the contract the launch of doginhood (0xFDdaC5e0…7777, DEX Screener dexId flapsh) was sent to (tx 0x1b0b178e…, block 52,846,989): it emits this topic with the token in data word 3 and "DUCKYY" / "DUCKYY" / a CID in words 4–6 on a sampled launch; 79,505 such logs between blocks 30M and 44M and 10,477 between 44M and 53.13M on 2026-09-03; the first launch is at block 4,227,932 (census 2026-09-05, see FLAP_START_BLOCK)',
    sourceUrl: 'https://flap.sh/',
  },

  /*
   * Launchpads added 2026-09-30 (founder decision D8: one verified factory at
   * a time). Each was found through HEY's own deployer census
   * (`contract_deployers.factory`), a creation-transaction trace of pool-only
   * tokens, or the launchpad's published docs or bundle, and each was checked
   * on chain 4663 twice, independently: the contract has code, its topic was
   * read from a live log, the log at the first launch block decodes to a token
   * that answers `symbol()`, and nothing emits the topic in the 200,000 blocks
   * before it. Launch counts and "unknown to HEY" are the whole-chain census
   * to block ~76.2M on 2026-09-30, matched against `token_candidates` and
   * `token_candidate_archive`.
   */
  {
    id: 'LETSCASH',
    name: 'letscash.fun',
    launchpad: 'letscash',
    chainId: 4663,
    factoryAddress: '0x5bd1Fbe78a78fe8236fa00CF48fbEBA74ae34661',
    startBlock: 6_160_000,
    eventTopic0: '0x17091df68f499cf4e20dcfc5d42f064dd22359e785b77691c4c4ed0322608897',
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'the letscash.fun bundle names this address as LAUNCHPAD_FACTORY and this topic as TOKEN_LAUNCHED_TOPIC; a 176-byte proxy; first launch at block 6,160,467 (tx 0x0b638ab3…) carries funcat (0x6e17153e…) in topics[1], which answers symbol(); 11,359 launches, 10,926 not in HEY (census 2026-09-30); samples funcat, TV, DOGE',
    sourceUrl: 'https://letscash.fun/',
  },
  {
    id: 'TRENCH',
    name: 'trench.today',
    launchpad: 'trench',
    chainId: 4663,
    factoryAddress: '0x77dC6f6361b7b99456FC3761ce5b7ddA80d83f9d',
    startBlock: 5_800_000,
    eventTopic0: '0xe2eb7016a2fc7f0aec441cc8bc9a7ecd75d29d94478782bab1cfa9c5b0dbdf1b',
    tokenTopicIndex: 3,
    eventStrings: { name: 1, symbol: 2, metadataUri: 4 },
    enabled: true,
    verification:
      'Bitquery\'s trench.today API doc names this address; a 758-byte proxy; first launch at block 5,801,338 (tx 0xdb57da55…) carries tte (0x8eeecc75…) in topics[3], and data words 1/2/4 decode to "tte" / "tte" / an IPFS URL, matching the token\'s own name() and symbol() ("chingchangchong"/"CCC" on another sample); 76,203 launches, 72,505 not in HEY (census 2026-09-30)',
    sourceUrl: 'https://docs.bitquery.io/docs/blockchain/robinhood/trench-today-api/',
  },
  {
    id: 'KLIK',
    name: 'Klik',
    launchpad: 'klik',
    chainId: 4663,
    factoryAddress: '0x16cF6788B762EE8969744586eD16fc5705140dd7',
    startBlock: 4_090_000,
    // ERC20TokenCreated(address): the token is not indexed.
    eventTopic0: '0x60122e78030aba0a2e4a67adb3e52b411343cc51778f919095d3fe394090c1b2',
    tokenTopicIndex: 'data',
    tokenDataWord: 0,
    enabled: true,
    verification:
      'the klik.finance bundle\'s per-chain launcher map lists this address for 4663 (and Bitquery\'s meme-coin-launches doc names it); 22,343 bytes of code; first launch at block 4,096,718 (tx 0x3052442c…) carries HOOD (0x6966aa52…) in data word 0, which answers symbol(); 6,599 launches, 6,569 not in HEY (census 2026-09-30); samples HOOD, KLIKERS, STARLINK',
    sourceUrl: 'https://klik.finance/',
  },
  {
    id: 'BAGS',
    name: 'Bags',
    launchpad: 'bags',
    chainId: 4663,
    factoryAddress: '0xe8Cc4431adF8b5A847C113EF0c6af9043219Cb37',
    startBlock: 8_240_000,
    eventTopic0: '0x643b3b606052cbadac2f906ad0b462da99eda2a1d4f824d315d7f6edd3e4cced',
    tokenTopicIndex: 1,
    eventStrings: { name: 3, symbol: 4, metadataUri: 5 },
    enabled: true,
    verification:
      'docs.bags.fm lists this address as BagsFactory on Robinhood Chain; a 130-byte proxy; first launch at block 8,240,408 (tx 0xac70e6c7…) carries TEST (0x9ec49402…) in topics[1], and data words 3/4/5 decode to "TEST" / "TEST" / an IPFS URL ("Tung Tung Tung Sahur"/"TRIPLET" on another sample, matching the token); 4,424 launches, 4,375 not in HEY (census 2026-09-30)',
    sourceUrl: 'https://docs.bags.fm/robinhood/overview',
  },
  {
    id: 'FLAUNCH',
    name: 'Flaunch',
    launchpad: 'flaunch',
    chainId: 4663,
    factoryAddress: '0x5Cf8e499C7c466C7E2cf127BDF129F57151E65Dc',
    startBlock: 14_470_000,
    // PoolCreated(bytes32, address memecoin, …): the token is data word 0; its name and ticker sit inside a nested tuple and are read from the token.
    eventTopic0: '0x88f75d7341103964abd68b657439ace486e110bfda589da9374fe9d69213c7c8',
    tokenTopicIndex: 'data',
    tokenDataWord: 0,
    enabled: true,
    verification:
      'flayerlabs/flaunch-sdk src/addresses.ts lists this address as the Robinhood FlaunchPositionManager; 23,524 bytes of code; first launch at block 14,472,014 (tx 0xf3468778…) carries TEST (0x0674ff0d…) in data word 0, which answers symbol(); 5,336 launches, 5,329 not in HEY (census 2026-09-30); samples TEST, SENTIENT, JACK',
    sourceUrl: 'https://github.com/flayerlabs/flaunch-sdk',
  },
  {
    id: 'LAUNCHHOOD_V3',
    name: 'LaunchHood',
    launchpad: 'launchhood',
    version: 'v3',
    chainId: 4663,
    factoryAddress: '0x62B33A039D289CBDa50EbeB72Fe4261449E61Bcf',
    startBlock: 8_480_000,
    eventTopic0: '0x4c27a723e73ca0ea76ef533aa6dfb2c623e2d3592d518fed4636ac3116c8f1c4',
    tokenTopicIndex: 1,
    eventStrings: { name: 2, symbol: 3, metadataUri: 4 },
    enabled: true,
    verification:
      'the launchhood.com bundle names this address LaunchHoodV3Factory; 15,739 bytes of code; first launch at block 8,482,947 (tx 0x30b19f9b…) carries Bison (0x5625b33d…) in topics[1], and data words 2/3/4 decode to "The Charging Bison" / "Bison" / ipfs://…; 4,170 launches, 21 not in HEY and 4,146 held with no launchpad (census 2026-09-30) — it adds attribution more than tokens',
    sourceUrl: 'https://launchhood.com/',
  },
  {
    id: 'APESTORE',
    name: 'ape.store',
    launchpad: 'apestore',
    chainId: 4663,
    factoryAddress: '0x6e4910ea5A04376032F6564da9a9E4E88B7a87C1',
    startBlock: 4_770_000,
    // CreateToken(address indexed token, uint256).
    eventTopic0: '0xb378e89b40ac5bbe0e2241b596fbe1adc3cf1fb7c982aa1b4560165cf264ee93',
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'Bitquery\'s meme-coin-launches doc names this address, and ape.store\'s own token API answers for BRUNO (0x0973…85da), the token this factory\'s log carries at block 50,056,769; 12,528 bytes of code; first launch at block 4,772,664 (tx 0xc52f35a6…) carries test2 (0x0adaf7a8…) in topics[1], which answers symbol(); 4,267 launches, 83 not in HEY and 4,076 held with no launchpad (census 2026-09-30)',
    sourceUrl: 'https://ape.store/',
  },
  /**
   * Uniswap's LiquidityLauncher v3.0.0 (2026-09-30, coordinator under founder
   * delegation): its own label, never folded into Pools. Uniswap's docs list
   * v3.0.0 at this CREATE2 address on every chain it supports, and its SDK
   * notes that Robinhood Chain was redeployed on 2026-08-05 to the v3.2.0
   * launcher HEY scans as `POOLS_TRADE`. The launches here are Uniswap's
   * launcher's, called by frontends other than the Pools app too.
   */
  {
    id: 'UNISWAP_LAUNCHER_V3_0',
    name: 'Uniswap Liquidity Launcher',
    launchpad: 'uniswap-launcher',
    version: 'v3.0.0',
    chainId: 4663,
    factoryAddress: '0x00004c4ccc709Ef590F7C81102C0689F0263D4e9',
    startBlock: 4_720_000,
    eventTopic0: '0x2e2b3f61b70d2d131b2a807371103cc98d51adcaa5e9a8f9c32658ad8426e74e',
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'Uniswap/docs content/liquidity/liquidity-launchpad/deployments.mdx lists LiquidityLauncher v3.0.0 at this address (commit 3a310354…), and @uniswap/liquidity-launcher-sdk src/addresses.ts names it LIQUIDITY_LAUNCHER; 3,747 bytes of code; the same launch event as POOLS_TRADE; first launch at block 4,727,385 (tx 0x45cd374b…) carries CCAH (0x8dbe1088…) in topics[1], which answers symbol(); nothing in the 100,000 blocks before; 8,684 launches, 8,471 not in HEY (census 2026-09-30)',
    sourceUrl: 'https://developers.uniswap.org/docs/liquidity/liquidity-launchpad/deployments',
  },
  /**
   * Torch (torchpad.fun), added 2026-11-11: its team sent the factory address. `TorchFactory` is a Sourcify exact match
   * (src/TorchFactory.sol), deployed at block 85,204,474 (tx 0x94ed6872…) and not a proxy. Its launch event is
   * `TokenLaunched(address indexed token, address indexed creator, PoolId poolId, uint256 buyTaxBps, uint24 lpFee,
   * uint256 antiSnipeSeconds, (uint16,uint16,uint16,uint16) split, string contractURI, address quote)`: the token in
   * `topics[1]`, the ERC-7572 contractURI's offset in data word 8; the name and ticker are not in the event and are read
   * from the token. Every Torch token is mined to end in `1111`.
   */
  {
    id: 'TORCH',
    name: 'Torch',
    launchpad: 'torch',
    chainId: 4663,
    factoryAddress: '0x7891ea889899928afe637e4cca8106188427776a',
    startBlock: 85_204_474,
    eventTopic0: '0xea6baf14ec1f4c08d18114c1eea0e6a2a018eef994f9db19ea8a41526e49d28c',
    tokenTopicIndex: 1,
    eventStrings: { metadataUri: 8 },
    enabled: true,
    verification:
      'the Torch team named this address (2026-11-11); Sourcify exact match for src/TorchFactory.sol:TorchFactory, 22,460 bytes of code, deployed at block 85,204,474 (tx 0x94ed6872…); first launch at block 85,204,501 (tx 0x7eec1e8d…) carries TORCH (0x000050e1…1111) in topics[1], which answers symbol(), and data word 8 points at an ipfs.io contractURI; BLOWTORCH (0x8a06f3eb…1111) on another sample; 2,169 launches to block 111,795,731 (census 2026-11-11); TORCH itself was held by HEY with no launchpad (first seen in a Uniswap v4 pool)',
    sourceUrl: 'https://torchpad.fun/',
  },
  /**
   * FOBO (fobo.fun), added 2026-11-11 beside Torch, on the same terms: read from the chain and its public repository
   * (github.com/fobodotfun/contracts @ 2745e56, which the deployed source matches). `FoboFactory` is a Sourcify exact
   * match, deployed at block 98,531,915 (tx 0x3eaa52d8…) and not a proxy; every pool is owned by FoboHook
   * (0x0Af57F62…28Ec). Its launch event is `TokenLaunched(address indexed token, bytes32 indexed poolId, address indexed
   * creator, address quote, int24 tickStart, uint256 devBuyTokens, string name, string ticker, string metadataURI)`:
   * the token in `topics[1]`, the name, ticker and metadataURI offsets in data words 3, 4 and 5.
   */
  {
    id: 'FOBO',
    name: 'FOBO',
    launchpad: 'fobo',
    chainId: 4663,
    factoryAddress: '0xd7e538e98A208fD19e46bc549FF4710C33664e18',
    startBlock: 98_531_915,
    eventTopic0: '0x026e4b7423df355927284925c5926f282ed0c33e8de0f31ba7381738fb2f1ba2',
    tokenTopicIndex: 1,
    eventStrings: { name: 3, symbol: 4, metadataUri: 5 },
    enabled: true,
    verification:
      'Sourcify exact match for FoboFactory, 14,116 bytes of code, deployed at block 98,531,915 (tx 0x3eaa52d8…), the same source as github.com/fobodotfun/contracts @ 2745e56; first launch at block 98,573,047 (tx 0xe6d7a59e…) carries FOBO (0x000DE658…3676) in topics[1], and data words 3/4/5 decode to "FOBO" / "FOBO" / "ipfs://fobo"; PHOBO (0x788c6be5…ae77) and FLORA (0x7bae7a90…fea8) answer symbol() on other samples; 1,111 launches to block 111,819,934 (census 2026-11-11)',
    sourceUrl: 'https://fobo.fun/',
  },
  /**
   * Lunch (lunch.fun), added 2026-11-13 from HEY's v4 hook index (its two hooks hold about 10,000 pools). Free launchpad on
   * Uniswap v3/v4 with stock and HOOD pairs and creator taxes. Two upgradeable launchers; every Lunch token ends in `0123`.
   */
  {
    id: 'LUNCH_PAIR',
    name: 'Lunch',
    launchpad: 'lunch',
    version: 'pair',
    chainId: 4663,
    factoryAddress: '0x6fda94aceedc5a97171469a8873d00fb9983bb8c',
    startBlock: 19_500_000,
    // PairLaunch(address indexed token, address indexed creator, address indexed quote, uint256 supply, int24 launchTick, uint256 devBuyEth)
    eventTopic0: '0x9f32a3db46638d93e1ef00e92774cd1856de77a732c52bc37c00114165371557',
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'a 130-byte ERC-1967 proxy onto 0x12848047…9df4, a Sourcify match for src/LunchV4PairLauncher.sol:LunchV4PairLauncher, whose PairLaunch hashes to this topic; first launch at block 19,505,527; the log at 112,780,466 carries Dacity (0x23ba9386…) in topics[1], which answers symbol(); 7,608 launches to block 112.87M (census 2026-11-13); robin.gives names Lunch as the launchpad of $ROBIN',
    sourceUrl: 'https://www.lunch.fun/',
  },
  {
    id: 'LUNCH_V4',
    name: 'Lunch',
    launchpad: 'lunch',
    version: 'v4',
    chainId: 4663,
    factoryAddress: '0xc783221ab1db0244203458417981b4631e80b988',
    startBlock: 13_750_000,
    // V4TokenMeta(address indexed token, address indexed creator, string image, string banner, string description, string website, string twitter, string telegram)
    eventTopic0: '0xbafbd5402f1dff9755e8c3a63fd90314672c209273f75a9d8670f8b1bca1dd33',
    tokenTopicIndex: 1,
    eventStrings: { imageUri: 0 },
    enabled: true,
    verification:
      'a 130-byte ERC-1967 proxy onto 0x375183BA…32b2, a Sourcify match for LunchV4Launcher; V4TokenMeta is the one per-launch event its launches all emit (TaxLaunch only for taxed ones: 411); first at block 13,754,341; the log at 110,330,942 carries UNITED (0x0bec5338…0123) in topics[1], which answers symbol(); 2,225 launches to block 112.87M (census 2026-11-13)',
    sourceUrl: 'https://www.lunch.fun/',
  },
  /**
   * o1 Launchpad (source github.com/o1exchange/o1-launch), added 2026-11-13: Uniswap v4 launches with RWA and stock-token
   * quotes. Four factory generations and a tax factory share one `Launched(address indexed token, bytes32 indexed poolId,
   * address indexed originalCreator, address quoteToken, uint256 launchSupply, int24 tickSpacing)` event. A sixth factory
   * (0xca111dcd…, 78 launches), held out at first because clanker.world lists its tokens as `clanker_tax`, is o1's second
   * tax factory: the founder ruled on 2026-11-13 that it carries the tokens launched with a tax on o1's launchpad.
   */
  ...o1Factories(),
  /**
   * Livo (livo.trade) and its fork Realm (realm.trade), added 2026-11-13: a bonding curve to a Uniswap v4 graduation.
   * Both emit `TokenCreated(address indexed token, string name, string symbol, address tokenOwner, address launchpad,
   * address graduator, address feeHandler)`; the name and ticker are data words 0 and 1.
   */
  {
    id: 'LIVO',
    name: 'Livo',
    launchpad: 'livo',
    chainId: 4663,
    factoryAddress: '0xb637800dcd5c83913d828e961dbb964a9896f19d',
    startBlock: 6_120_000,
    eventTopic0: '0x21ed19b2f144544b70507a7599a59da1c4bbf58f346d4e49debfc0e94d14e870',
    tokenTopicIndex: 1,
    eventStrings: { name: 0, symbol: 1 },
    enabled: true,
    verification:
      'ERC-1967 proxy onto 0xF74aD241…5258, a Sourcify exact match for LivoFactoryUniV4Unified (github.com/LivoLaunchpad/livo-contracts); 933 launches 6,120,893–76,051,374; VLADBOT (0x353a93db…) in topics[1] answers symbol() (census 2026-11-13)',
    sourceUrl: 'https://github.com/LivoLaunchpad/livo-contracts',
  },
  {
    id: 'REALM',
    name: 'Realm',
    launchpad: 'realm',
    chainId: 4663,
    factoryAddress: '0xc763b1795dabe2d2336eba214d16969ebc5db27f',
    startBlock: 82_790_000,
    eventTopic0: '0x21ed19b2f144544b70507a7599a59da1c4bbf58f346d4e49debfc0e94d14e870',
    tokenTopicIndex: 1,
    eventStrings: { name: 0, symbol: 1 },
    enabled: true,
    verification:
      'ERC-1967 proxy onto 0xEf8D9941…413A, a Sourcify exact match for RealmFactoryUniV4Direct (github.com/RealmLaunchpad/realm-contracts); 663 launches 82,795,885–110,970,373; FuckRed (0xaca3aaa9…) answers symbol() (census 2026-11-13)',
    sourceUrl: 'https://github.com/RealmLaunchpad/realm-contracts',
  },
  /**
   * LIFT (lift.fun), added 2026-11-13: an unverified factory LIFT's own runtime config names as its Robinhood Chain
   * `factoryV4` (lift.fun/config.js, `"id":4663 … "factoryV4":"0xC739229D…"`); every launch's metadata link points to
   * api.lift.fun. One unnamed event per launch, the token in topics[1]; name, ticker and metadata URI are head offsets
   * 7, 8 and 9. `InitialBuyExecuted` (0x34b6bd41…) fires only with an initial buy and is not read.
   */
  {
    id: 'LIFT',
    name: 'LIFT',
    launchpad: 'lift',
    chainId: 4663,
    factoryAddress: '0xc739229dc490ee67f3472604f4addd57178489c6',
    startBlock: 76_560_000,
    eventTopic0: '0x6f0c466814ca3040318951d80aafb489060ae72ecdfc7cd1d5678ca5d8038c0e',
    tokenTopicIndex: 1,
    eventStrings: { name: 7, symbol: 8, metadataUri: 9 },
    enabled: true,
    verification:
      'named factoryV4 for chain 4663 in lift.fun/config.js (VITE_LAUNCH_CHAINS); unverified bytecode; 5,238 launches 76,563,848–112,612,528, tokens ending 0087; FRUMP (0x715d7814…0087) answers symbol() (census 2026-11-13)',
    sourceUrl: 'https://lift.fun/',
  },
  ...pangeaFactories(),
  /**
   * Cook Market (cook.market), added 2026-11-13: DefiLlama's cook-market adapter names this CookLauncherFactory and its
   * CookHook (0xfe3e…3044, in Uniswap's hooklist); the same deployer set up Cook's buyback and called `setCookToken`.
   * `TokenLaunched` carries the token in topics[1] and the name and ticker as head offsets 6 and 7. Dormant since 65.9M.
   */
  {
    id: 'COOK',
    name: 'Cook Market',
    launchpad: 'cook',
    chainId: 4663,
    factoryAddress: '0x059bce487c6be54ceb4e79c60a6d95f9119732dc',
    startBlock: 57_700_000,
    eventTopic0: '0x4bc3e1c7563116fd43fe920faebc0e711cddc122034360e8c8e1b4c81c5267a5',
    tokenTopicIndex: 1,
    eventStrings: { name: 6, symbol: 7 },
    enabled: true,
    verification:
      'named by DefiLlama dimension-adapters fees/cook-market (FACTORY, "Cook Market launchpad on Robinhood Chain … https://cook.market"); verified CookLauncherFactory; 415 launches 57,711,220–65,932,680 (census 2026-11-13)',
    sourceUrl: 'https://cook.market/',
  },
  /**
   * NOXA Fun's second factory (fun.noxa.fi), added 2026-11-13: NOXA's live app names it as `launchFactory` in its own
   * bundle, and the factory's `allTokensLength()` (1,141) matches the event count. It shares the launchpad key of the
   * first factory (`hoodit`, NOXA's old name; see HOODIT below). An unnamed event per launch, the token in topics[1] and
   * the creator in topics[2]; no strings. Not the Pons V1 event its first factory emits. noxa.io's factory is another
   * operator and is not here.
   */
  {
    id: 'NOXA_V2',
    name: 'NOXA Fun',
    launchpad: 'hoodit',
    version: 'V2',
    chainId: 4663,
    factoryAddress: '0xdd84fddea1206115b37dbbc0ba5721530e1ba9c5',
    startBlock: 16_400_000,
    eventTopic0: '0xe0f2fe1352e2f75144ba7108a1ff91b507e2cd0c64767e325f6d42d5fdf29434',
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'named launchFactory in fun.noxa.fi\'s bundle ("Noxa — launch on Robinhood Chain"); allTokensLength() = 1,141 = the event count; 1,141 launches 16,402,349–112,686,507, tokens ending 4663; 0x424e8ae4…4663 answers symbol() (census 2026-11-13)',
    sourceUrl: 'https://fun.noxa.fi/',
  },
  /**
   * Standard Reserve's launchpad (standardreserve.xyz), added 2026-11-13: a verified `LaunchFactory`
   * (src/launchpad/LaunchFactory.sol) whose fee multisig 0x0478…415f has the same four owners and the same 2-of-4
   * threshold as the Safe 0x5c19…a68c that owns Standard Reserve's own contracts; projects launched through it say "live
   * on @standard_rsv" (PACT 0x7775c5ae…, TRANCH 0x2b8308f1…, STANDY 0x8dfdeabe…, each from its TokenDeployer
   * 0xf47e03be…). `Launched(address indexed token, address indexed curve, address indexed creator, LaunchInfo info)`, the
   * token in topics[1]; the name and ticker sit inside the dynamic `info` tuple, so no string offsets are read. Not the
   * StandardLaunchFactory family (0xf05a26e9…, 0xbbdaa46a…), which another owner runs and which stays unlabelled.
   */
  {
    id: 'STANDARD_RESERVE',
    name: 'Standard Reserve',
    launchpad: 'standard-reserve',
    chainId: 4663,
    factoryAddress: '0x3d6ea4e97b8ab9e1a1b4943febffe22d8c920091',
    startBlock: 88_360_000,
    eventTopic0: '0xa0354dae199953f2dbde6be8415166a744e7f92b7328671692196d8fdbb6bd9d',
    tokenTopicIndex: 1,
    enabled: true,
    verification:
      'verified LaunchFactory deployed at block 88,360,332; its feeMultisig() 0x047829087f9ac81fdb05f7b750458afe3d72415f has the owners and threshold (2 of 4) of Standard Reserve\'s Safe 0x5c19f925e1e0d54e34681a6cb70d55c90b12a68c, which owns its reserve contracts; 2,210 launches 88,527,856–112,006,462; PACT (0x7775c5ae…) answers symbol() (census 2026-11-13)',
    sourceUrl: 'https://www.standardreserve.xyz/',
  },
];


function robinpadFactories(): LaunchFactoryConfig[] {
  const entry = (
    id: string,
    version: string,
    factoryAddress: `0x${string}`,
    eventTopic0: `0x${string}`,
    startBlock: number,
    verification: string,
  ): LaunchFactoryConfig => ({
    id,
    name: 'Robinpad',
    launchpad: 'robinpad',
    version,
    chainId: 4663,
    factoryAddress,
    startBlock,
    eventTopic0,
    tokenTopicIndex: 1,
    enabled: true,
    verification,
    sourceUrl: 'https://www.robinpad.app/docs',
  });
  const MAIN = '0xEb3FeeD2716cF0eEAda05B22e67424794e1f5a80' as const;
  const CREATED = '0xa52263eeb2ea349365a35c006fc978b0b85eb109fe50959959c829b329bebf9e' as const;
  const CREATED_ALT = '0x096627c8a73b9cd80e060634e86d64ccb00710637ab5b294c82d1ce416a23c8d' as const;
  const REFLECTION_CREATED = '0x71fc7051f6ff796b0915a433ad35f46d780c8a1a8251ab26bee71fb838abab90' as const;
  const INSTANT_CREATED = '0xa2a5ae17f394d0d1eef41cd8a3100f216ea25bf15bd748edd53d97b56ede0061' as const;
  const INSTANT_ROBIN_CREATED = '0xf774d599306b1180c554a93c21ec973bab3380f00b27d44600f0699b62f081ae' as const;
  return [
    entry('ROBINPAD_FACTORY', 'factory', MAIN, CREATED, 980_000,
      'FACTORY in the bundle; 704-byte proxy; the ROBIN token itself (0xfB4729…) was created through it (tx 0x74685f12…, block 983,265) and it emits this topic with the token in topics[1]; 51 such logs (0.98M–13.03M)'),
    entry('ROBINPAD_FACTORY_ALT', 'factory', MAIN, CREATED_ALT, 2_750_000,
      'the same factory\'s second creation event: 28 logs (2.75M–10.53M) whose topics[1] answer symbol() VLAD ("The Hood Bull"), CAPYHOOD'),
    entry('ROBINPAD_LEGACY', 'legacy', '0xAf9f3ce1d34909F59E88c23027f89d5807B0F915', CREATED, 361_000,
      'LEGACY_FACTORY in the bundle; 23,504 bytes; 3 creation logs (361,903–364,180)'),
    entry('ROBINPAD_REFLECTION', 'reflection', '0x6Ce85c4b7cE12903E5867652C265bCcce57f935F', REFLECTION_CREATED, 3_870_000,
      'REFLECTION_FACTORY in the bundle; TokenCreated(token, creator, rewardToken, threshold); 19 logs (3.87M–44.61M) whose topics[1] answer symbol() APPO, RSMOKE'),
    entry('ROBINPAD_REFLECTION_LEGACY', 'reflection legacy', '0x2110f111d2776eF53366B9eAEf8c5619Fde09EEf', REFLECTION_CREATED, 3_590_000,
      'LEGACY_REFLECTION_FACTORY in the bundle; 1 TokenCreated log (block 3,598,418)'),
    entry('ROBINPAD_REFLECTION_PAIR', 'reflection pair', '0x2A9D79B28D506B209511792795a182e726975C76', REFLECTION_CREATED, 13_550_000,
      'REFLECTION_PAIR_FACTORY in the bundle; 7 TokenCreated logs (13.56M–14.91M)'),
    entry('ROBINPAD_INSTANT', 'instant', '0xD7601cEe401306fdea5833c6898181D9c770F800', INSTANT_CREATED, 11_960_000,
      'INSTANT_FACTORY in the bundle; InstantTokenCreated(token, creator, backingWallet, isMeme, isMargin, isRwa, pool, positionId, dexId); 27 logs (11.97M–49.27M) whose topics[1] answer symbol() FATVLAD'),
    entry('ROBINPAD_INSTANT_GOLD', 'instant gold', '0x346c46CF7D8DfeD2c614c38570C697ac948FeEEc', INSTANT_CREATED, 17_980_000,
      'INSTANT_GOLD_FACTORY in the bundle; 2 InstantTokenCreated logs (17.98M–17.99M)'),
    entry('ROBINPAD_INSTANT_ROBIN', 'instant robin', '0x6bfab86122842eb6e8602124dcebf6a373498ffc', INSTANT_ROBIN_CREATED, 10_890_000,
      'INSTANT_ROBIN_FACTORY in the bundle; 3 creation logs (10.89M–11.00M) whose topics[1] answer symbol() TESTYSPY, TTTEST'),
  ];
}

export const enabledFactories = (chainId: number): LaunchFactoryConfig[] =>
  LAUNCH_FACTORIES.filter((factory) => factory.enabled && factory.chainId === chainId);

export const factoryById = (id: string): LaunchFactoryConfig | undefined =>
  LAUNCH_FACTORIES.find((factory) => factory.id === id);

/**
 * Contracts that are not launch factories but stand in front of one.
 *
 * A launchpad's public factory is not always what an account calls. Pons runs
 * a launch-and-buy router that creates the token and buys into it in the same
 * transaction, and every creation through it reports the router as the entry
 * point — so `/scan` could only say "a contract ran the creation" for a launch
 * it understood perfectly well (2026-09-15).
 *
 * These are **naming only**. They emit no launch event of their own and are
 * never swept for intake: the factory behind them already emits its event, so
 * the hourly sweep catches those launches either way (35,262 PONS_V2
 * candidates in the 24 hours this was written). Adding a router to
 * `LAUNCH_FACTORIES` would double-count them.
 */
export type LaunchRouterConfig = {
  address: string;
  chainId: number;
  /** What to call it in a report. */
  name: string;
  /** The factory it fronts, when it fronts one. */
  factoryAddress?: string;
  /** False for a generic contract that says nothing about who launched. */
  isLaunchpad: boolean;
  verification: string;
};

export const LAUNCH_ROUTERS: readonly LaunchRouterConfig[] = [
  {
    address: '0xe33e9e479df8802cb0866d5d05258bec4cf62948',
    chainId: 4663,
    name: "Pons's launch-and-buy router",
    factoryAddress: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
    isLaunchpad: true,
    verification:
      'answers launchAndBuy (62,324 calls) and factory(); an eth_call to factory() returns 0x7eD598Bc…EC7e, the registered Pons V2 factory. 4,417 bytes on 4663. Twenty of the sixty most recent creations through Pons\'s token deployer came through it (probed 2026-09-15)',
  },
  {
    // Not a launchpad, and naming it is the point: a reader who sees a launch
    // routed through a generic batcher should not read it as a service.
    address: '0xca11bde05977b3631167028862be2a173976ca11',
    chainId: 4663,
    name: 'Multicall3, a generic batching contract',
    isLaunchpad: false,
    verification:
      "the canonical Multicall3 address, identical on every EVM chain; it batches calls and belongs to no launchpad. Four of the sixty most recent creations through Pons's token deployer were batched through it (probed 2026-09-15)",
  },
];

/** What to call a contract that fronted a creation, if HEY has verified one. */
export const routerByAddress = (
  chainId: number,
  address: string,
): LaunchRouterConfig | undefined => {
  const wanted = address.toLowerCase();
  return LAUNCH_ROUTERS.find(
    (router) => router.chainId === chainId && router.address.toLowerCase() === wanted,
  );
};

/**
 * The launchpad a contract address belongs to, if HEY has verified one there.
 *
 * `/scan` reads the creating call from the decoded chain and gets back whatever
 * executed it. When that is a registry factory, HEY can name the launchpad
 * rather than say "a contract" — the same verified addresses the hourly intake
 * already watches, so nothing new is being claimed (2026-09-15).
 */
export const factoryByAddress = (
  chainId: number,
  address: string,
): LaunchFactoryConfig | undefined => {
  const wanted = address.toLowerCase();
  return LAUNCH_FACTORIES.find(
    (factory) => factory.chainId === chainId && factory.factoryAddress.toLowerCase() === wanted,
  );
};
