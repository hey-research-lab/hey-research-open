import { readFileSync } from 'node:fs';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { composeResearch, type AgentComposeContext } from '@hey/agent-provider-core';
import { HeyClient } from '@hey-research-lab/sdk';

import * as fx from './fixtures/api';
import { createHeyMcpServer, type HeyMcpOptions } from './server';

/**
 * Golden baseline of the MCP surface (multichain WP1.0, 2026-11-11).
 *
 * Invariant I7 (a private HEY record §8): every MCP `chainId` input defaults to 4663 and tool
 * names stay unchanged. These goldens hold, byte for byte, what a model reads: the handshake (server info,
 * capabilities, instructions), `tools/list` on both profiles and with Market Integrity offered (names, descriptions,
 * input and output schemas, annotations), and six tool answers on the checked-in API fixtures, through a real MCP
 * client over an in-memory transport. Nothing here reads the network: the client's fetch answers from the fixtures.
 *
 * A phase 1 package leaves every byte alone. A deliberate change to the tools updates the goldens on purpose
 * (`pnpm vitest run --project unit -u packages/mcp-core/src/golden.test.ts`) and says why in the commit.
 */
// `@hey/config/golden`'s serializer, inlined: this package is published on npm and takes no private dependency.
const goldenJson = (value: unknown): string => `${JSON.stringify(value, (_key, child: unknown) => (child === undefined ? '[undefined]' : child), 2)}\n`;

const NOW = new Date('2026-11-11T12:00:00Z');
const BASE = 'https://hey.test';
const thisWeek = JSON.parse(readFileSync(new URL('./fixtures/this-week.json', import.meta.url), 'utf8')) as unknown;

const agentAnswer = composeResearch(
  {
    baseUrl: BASE,
    chainId: 4663,
    chainName: 'Robinhood Chain',
    now: NOW,
    disclaimer: fx.snapshot.disclaimer,
    selfUrl: `${BASE}/api/agent/research_project?project=agentos`,
    query: { chainId: 4663, project: 'agentos' },
  } satisfies AgentComposeContext,
  { snapshot: fx.snapshot, gaps: [], tier: 'HOT' },
);

function routeFixture(path: string): unknown {
  if (path.startsWith('/api/agent/')) return agentAnswer;
  if (path === '/api/projects') return fx.projectsPage;
  if (path.startsWith('/api/token/')) return path.endsWith('a'.repeat(40)) ? fx.lookupUnknown : fx.lookupPublished;
  if (path.endsWith('/snapshot')) return fx.snapshot;
  if (path === '/api/changes') return fx.changes;
  if (path.endsWith('/timeline')) return fx.timeline;
  if (path.startsWith('/api/contracts/')) return fx.contract;
  if (path.endsWith('/contracts')) return fx.projectContracts;
  if (path === '/api/chain') return fx.chain;
  if (path === '/api/this-week') return thisWeek;
  throw new Error(`no fixture for ${path}`);
}

async function connect(options: HeyMcpOptions = {}) {
  const requested: string[] = [];
  const fetchImpl = async (input: string) => {
    const url = new URL(input);
    requested.push(`${url.pathname}${url.search}`);
    return { ok: true, status: 200, headers: new Headers(), json: async () => routeFixture(url.pathname) } as Response;
  };
  const server = createHeyMcpServer(new HeyClient({ baseUrl: BASE, fetchImpl }), () => NOW, options);
  const client = new Client({ name: 'golden', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  return { client, requested };
}

describe('golden: the MCP handshake and tool list', () => {
  it('the handshake: server info, capabilities and instructions', async () => {
    const { client } = await connect();
    await expect(
      goldenJson({ serverVersion: client.getServerVersion(), capabilities: client.getServerCapabilities(), instructions: client.getInstructions() }),
    ).toMatchFileSnapshot('./__goldens__/mcp-handshake.json');
  });

  it.each([
    ['full', {}],
    ['research', { profile: 'research' }],
    ['full-market-integrity', { marketIntegrity: true }],
  ] as const)('tools/list on the %s profile', async (name, options: HeyMcpOptions) => {
    const { client } = await connect(options);
    const { tools } = await client.listTools();
    await expect(goldenJson(tools)).toMatchFileSnapshot(`./__goldens__/mcp-tools.${name}.json`);
  });
});

describe('golden: six MCP tool answers on the API fixtures', () => {
  const calls: [string, Record<string, unknown>][] = [
    ['research_answer', { capability: 'research_project', project: 'agentos' }],
    ['find_projects', { query: '0xcab100000000000000000000000000000000cb07' }],
    ['get_project_snapshot', { slug: 'agentos' }],
    ['get_changes', { project: 'agentos' }],
    ['get_project_timeline', { slug: 'equifold' }],
    ['get_contract', { address: '0xcab100000000000000000000000000000000cb07' }],
  ];

  it.each(calls)('%s %j', async (tool, args) => {
    const { client, requested } = await connect();
    const result = await client.callTool({ name: tool, arguments: args });
    // What it read (the chain id in the path included), and everything it answered.
    await expect(goldenJson({ requested, result })).toMatchFileSnapshot(`./__goldens__/mcp-call.${tool}.json`);
  });
});
