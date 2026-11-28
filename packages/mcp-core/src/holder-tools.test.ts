import { readFileSync } from 'node:fs';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { HeyClient, type HeyTerminalCatalysts, type HeyTerminalContractControl, type HeyTerminalDeepResearch, type HeyTerminalSavedViews, type HeyTerminalScreener } from '@hey-research-lab/sdk';

import { renderCatalysts, renderContractControl, renderDeepResearch, renderSavedViews, renderScreener } from './render-terminal';
import { createHeyMcpServer, type HeyMcpOptions } from './server';
import { HEY_MCP_HOLDER_TOOL_LIST_BUDGET, HEY_MCP_HOLDER_TOOLS, HEY_MCP_TOOLS, mcpToolsFor } from './tools';

/**
 * The holder tools (2026-11-27, Terminal holder value wave 3 lane K), driven through a real MCP client: they are listed
 * only with a key and only on the full profile, a keyless list is unchanged, each reads exactly its `/api/terminal/*`
 * route through the SDK, a refused key says the route's sentence, and the text restates the answer and nothing more.
 */
const NOW = new Date('2026-11-27T12:00:00Z');

const deep: HeyTerminalDeepResearch = {
  status: 'answered',
  question: 'what has hoodlock shipped',
  scope: { kind: 'project', project: { slug: 'hoodlock', name: 'HoodLock' } },
  steps: [
    {
      key: 'status',
      title: 'Building status',
      question: 'is hoodlock still building',
      understood: 'builder status of HoodLock',
      lead: 'HoodLock is Active.',
      lines: [{ tag: 'FACT', text: 'Released v2.1.', project: { slug: 'hoodlock', name: 'HoodLock' }, at: '2026-11-20T00:00:00.000Z', evidence: [{ id: 'ship:1f2e', label: 'release', url: 'https://hey.test/api/evidence/ship%3A1f2e' }] }],
      held: 1,
      notes: [],
      shown: { shown: 1, total: 4 },
    },
  ],
  receipts: ['ship:1f2e'],
  aiUsed: false,
  method: 'Each step is one of Ask HEY’s canonical answers from HEY’s records.',
  allowance: { dailyQuota: 10, remaining: 9, repeated: false, resetsAt: '2026-11-28T00:00:00.000Z', sharedWith: 'the Terminal’s Deep research page' },
};

const views: HeyTerminalSavedViews = {
  views: [
    { id: '0b3a1c9e-1d2f-4a5b-8c7d-0123456789ab', name: 'Shipping DeFi', search: 'status=SHIPPING', query: { cols: ['status'], status: 'SHIPPING' }, terminalUrl: 'https://hey.test/terminal/centre/screener?view=x', lastSeenAt: null, createdAt: '2026-11-22T00:00:00.000Z', news: { state: 'NOT_TRACKED', reason: 'never_opened' } },
  ],
  shown: 1,
  total: 1,
  limit: 12,
  note: 'Every saved view of the account.',
};

const screener: HeyTerminalScreener = {
  query: { cols: ['status'] },
  savedView: null,
  columns: [{ key: 'status', label: 'Status', definition: 'Activity status.' }],
  rows: [
    {
      slug: 'hoodlock',
      name: 'HoodLock',
      url: 'https://hey.test/project/hoodlock',
      narrative: null,
      activityStatus: 'ACTIVE',
      lastMeaningfulShipAt: '2026-11-20T00:00:00.000Z',
      ships30d: 4,
      ships30dWithheld: null,
      buildMomentum: null,
      buildMomentumWithheld: 'activity_unknown',
      discoveryGap: null,
      discoveryGapWithheld: 'market_too_thin',
      verifiedBuilder: true,
      chainEvidence: null,
      token: null,
      development: null,
    },
  ],
  shown: 1,
  total: 40,
  offset: 0,
  limit: 25,
  nextOffset: 25,
  order: { sort: 'shipped', label: 'Latest ship', hint: 'the newest counted ship first.' },
  marketFields: 'none: rows carry builder facts only.',
};

const control: HeyTerminalContractControl = {
  slug: 'hoodlock',
  contracts: [{ address: '0x' + '1'.repeat(40), role: 'token', proxyKind: null, state: 'not_read', readThrough: null, owner: null, ownerProposed: null, admin: null }],
  pending: [],
  recent: [],
  recentShown: 0,
  recentLimit: 30,
  recentMore: null,
  notRead: 1,
  readThrough: null,
  note: 'Contract-level facts: no account is returned.',
};

const catalysts: HeyTerminalCatalysts = {
  view: 'chain',
  board: null,
  projectCount: null,
  windowDays: 90,
  readAt: NOW.toISOString(),
  items: [
    {
      id: 'unlock:4663:7',
      kind: 'unlock',
      kindWords: 'Unlock',
      basis: 'read_on_chain',
      basisWords: 'Read on chain',
      source: 'HoodLock',
      title: 'HoodLock lock #7 unlocks',
      detail: 'd',
      at: '2026-12-10T00:00:00.000Z',
      project: { slug: 'hoodlock', name: 'HoodLock', symbol: 'HOOD' },
      lockId: 7,
      receipt: { id: 'lock:4663:7', url: 'https://hoodlock.test/7', label: 'HoodLock lock #7' },
    },
  ],
  unlocksShown: 1,
  unlocksTotal: 1,
  unlocksMore: null,
  stockTokens: { included: false, note: 'Stock Token multiplier changes are on the Terminal’s calendar page only.' },
  notRead: [{ kind: 'proof_of_ship', line: 'Proof of Ship bounty windows are not on this calendar.' }],
  order: 'By date alone.',
};

const FIXTURES: Record<string, unknown> = {
  '/api/terminal/deep-research': deep,
  '/api/terminal/saved-views': views,
  '/api/terminal/screener': screener,
  '/api/terminal/contract-control': control,
  '/api/terminal/catalysts': catalysts,
};

const respond = (body: unknown, status = 200): Response => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body }) as Response;

async function connect(fetchImpl: (input: string, init?: RequestInit) => Promise<Response>, options: HeyMcpOptions = {}) {
  const server = createHeyMcpServer(new HeyClient({ baseUrl: 'https://hey.test', fetchImpl, apiKey: 'hey_test_key' }), () => NOW, options);
  const client = new Client({ name: 'test', version: '0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

type Content = { type: string; text?: string };
const textOf = (result: unknown): string => (((result as { content?: Content[] }).content ?? [])[0]?.text ?? '');
const HOLDER_NAMES = HEY_MCP_HOLDER_TOOLS.map((tool) => tool.name);
const VERDICT = /\b(safe|unsafe|audited|rug|scam|undervalued|buy|sell|bullish|bearish|price target|whale|smart money)\b/i;

describe('the holder MCP tools (2026-11-27, lane K)', () => {
  const never = async () => {
    throw new Error('no read expected');
  };

  it('are not listed without a key: the keyless list is byte for byte what it was', async () => {
    const keyless = (await (await connect(never)).listTools()).tools;
    const explicit = (await (await connect(never, { holder: false })).listTools()).tools;
    expect(keyless.map((tool) => tool.name).sort()).toEqual(HEY_MCP_TOOLS.map((tool) => tool.name).sort());
    expect(keyless.map((tool) => tool.name).filter((name) => name.startsWith('terminal_'))).toEqual([]);
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(keyless));
  });

  it('are listed with a key on the full profile only, within their own byte budget', async () => {
    const keyless = (await (await connect(never)).listTools()).tools;
    const keyed = (await (await connect(never, { holder: true })).listTools()).tools;
    expect(keyed.map((tool) => tool.name).filter((name) => name.startsWith('terminal_')).sort()).toEqual([...HOLDER_NAMES].sort());
    expect(keyed).toHaveLength(keyless.length + 5);
    expect(HEY_MCP_HOLDER_TOOL_LIST_BUDGET).toBe(6_500);
    expect(JSON.stringify(keyed).length - JSON.stringify(keyless).length).toBeLessThan(HEY_MCP_HOLDER_TOOL_LIST_BUDGET);
    for (const tool of keyed.filter((entry) => entry.name.startsWith('terminal_'))) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.description, tool.name).toMatch(/^Research Terminal accounts only/);
      expect(tool.description ?? '', tool.name).not.toMatch(VERDICT);
    }
    const research = (await (await connect(never, { holder: true, profile: 'research' })).listTools()).tools;
    expect(research.map((tool) => tool.name).filter((name) => name.startsWith('terminal_'))).toEqual([]);
    expect(mcpToolsFor('research', { holder: true }).some((tool) => tool.name.startsWith('terminal_'))).toBe(false);
  });

  it('each reads exactly its /api/terminal route through the SDK, with the key, and restates the answer', async () => {
    const asked: { path: string; params: URLSearchParams; auth: string | null }[] = [];
    const fetchImpl = async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      asked.push({ path: url.pathname, params: url.searchParams, auth: new Headers(init?.headers).get('authorization') });
      return respond(FIXTURES[url.pathname]);
    };
    const client = await connect(fetchImpl, { holder: true });
    const calls: [string, Record<string, unknown>, string][] = [
      ['terminal_deep_research', { q: 'What has hoodlock shipped?' }, '/api/terminal/deep-research'],
      ['terminal_saved_views', {}, '/api/terminal/saved-views'],
      ['terminal_screener', { status: 'ACTIVE', verified: true, shipped: 30 }, '/api/terminal/screener'],
      ['terminal_contract_control', { slug: 'hoodlock', limit: 10 }, '/api/terminal/contract-control'],
      ['terminal_catalysts', { view: 'chain', days: 90 }, '/api/terminal/catalysts'],
    ];
    for (const [name, args, path] of calls) {
      const before = asked.length;
      const result = await client.callTool({ name, arguments: args });
      expect(asked.slice(before).map((entry) => entry.path), name).toEqual([path]);
      expect(asked[before]!.auth, name).toBe('Bearer hey_test_key');
      expect((result as { isError?: boolean }).isError, name).toBeFalsy();
      const text = textOf(result);
      expect(text.length, name).toBeGreaterThan(0);
      expect(text, name).not.toMatch(VERDICT);
    }
    const screen = asked.find((entry) => entry.path === '/api/terminal/screener')!;
    expect(Object.fromEntries(screen.params)).toEqual({ status: 'ACTIVE', verified: '1', shipped: '30' });
    expect(Object.fromEntries(asked.find((entry) => entry.path === '/api/terminal/contract-control')!.params)).toEqual({ slug: 'hoodlock', limit: '10' });
  });

  it('says the route’s refusal for a key the Terminal does not admit, never an empty answer', async () => {
    const refusal = 'This key’s account does not reach the holding the Research Terminal asks for, by HEY’s latest check.';
    const client = await connect(async () => respond({ error: 'forbidden', message: refusal, reason: 'not_terminal_account', terminalAccess: 'not_holding' }, 403), { holder: true });
    const result = await client.callTool({ name: 'terminal_saved_views', arguments: {} });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(textOf(result)).toContain(refusal);
  });

  it('read the public API through the SDK only, never the database or a provider', () => {
    for (const file of ['./render-terminal.ts', './server.ts', './tools.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/from '@hey\/(db|domain|sources)'/);
      expect(source, file).not.toMatch(/\bfetch\(/);
    }
  });
});

describe('the holder tools’ text (render-terminal)', () => {
  it('deep research: every printed line carries its receipt, held sentences are counted, the allowance is said', () => {
    const { body, footer } = renderDeepResearch(deep);
    expect(body).toContain('- FACT: Released v2.1. [ship:1f2e]');
    expect(body).toContain('1 sentence with no receipt held, not printed.');
    expect(body).toContain('Showing 1 of 4.');
    expect(footer).toContain('9 of 10 deep questions left today');
    const declined = renderDeepResearch({ status: 'declined', question: 'q', reason: 'HEY does not answer questions about prices. Nothing was spent.', candidates: [] });
    expect(declined.body).toBe('Deep research declined: HEY does not answer questions about prices. Nothing was spent.');
  });

  it('saved views: not tracked says why, never 0', () => {
    const { body, footer } = renderSavedViews(views);
    expect(body).toContain('new matches not tracked (never opened)');
    expect(body).not.toMatch(/\b0 new\b/);
    expect(footer).toContain('Showing all 1.');
  });

  it('screener: an unmeasured figure says not measured with its reason, unknown chain evidence says not read, and it says how to read on', () => {
    const { body, footer } = renderScreener(screener);
    expect(body).toContain('Build Momentum not measured (activity_unknown)');
    expect(body).toContain('Discovery Gap not measured (market_too_thin)');
    expect(body).toContain('chain evidence not read');
    expect(body).not.toMatch(/valuation|price|liquidity \$|volume \$/i);
    expect(footer).toContain('Showing 1 of 40.');
    expect(footer).toContain('offset=25');
  });

  it('contract control: a contract the watch has not read says so, never "no owner"; no account is printed', () => {
    const { body } = renderContractControl(control);
    expect(body).toContain('not read yet by the control watch');
    expect(body).not.toMatch(/no owner/i);
    expect(body).toContain('None queued that HEY read.');
  });

  it('catalysts: HoodLock unlocks with their lock receipts, and Stock Token changes named as kept on the page', () => {
    const { body, footer } = renderCatalysts(catalysts);
    expect(body).toContain('Receipt: lock:4663:7');
    expect(body).toContain('Stock Token multiplier changes are on the Terminal’s calendar page only.');
    expect(body).toContain('Proof of Ship bounty windows are not on this calendar.');
    expect(footer).toContain('Showing all 1.');
  });
});
