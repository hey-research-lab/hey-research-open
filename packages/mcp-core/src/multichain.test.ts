import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { HeyClient } from '@hey-research-lab/sdk';

import * as fx from './fixtures/api';
import { createHeyMcpServer } from './server';
import { HEY_MCP_GATED_TOOLS, HEY_MCP_TOOLS } from './tools';

/**
 * I7 (multichain phase 1, 2026-11-12; D9): every MCP `chainId` input is optional and defaults to Robinhood Chain (4663),
 * the tool names are unchanged, and `hey://contract/{chainId}/{address}` resolves on 4663. Phase 3 (WP3.3) adds a
 * chain enum; until then nothing a client sends reaches another chain unless it names one.
 */
const NOW = new Date('2026-11-12T12:00:00Z');
const respond = (body: unknown): Response => ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

async function connect(requested: URL[]) {
  const fetchImpl = async (input: string) => {
    const url = new URL(input);
    requested.push(url);
    if (url.pathname.startsWith('/api/contracts/')) return respond(fx.contract);
    if (url.pathname.startsWith('/api/token/')) return respond(fx.lookupPublished);
    if (url.pathname === '/api/projects') return respond(fx.projectsPage);
    throw new Error(`no fixture for ${url.pathname}`);
  };
  const server = createHeyMcpServer(new HeyClient({ baseUrl: 'https://hey.test', fetchImpl }), () => NOW, { marketIntegrity: true });
  const client = new Client({ name: 'test', version: '0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('MCP chain inputs (I7)', () => {
  it('lists the same tool names, and every chainId input is optional with Robinhood Chain as its default', async () => {
    const requested: URL[] = [];
    const client = await connect(requested);
    const tools = (await client.listTools()).tools;
    expect(tools.map((tool) => tool.name).sort()).toEqual([...HEY_MCP_TOOLS, ...HEY_MCP_GATED_TOOLS].map((tool) => tool.name).sort());
    const withChain = tools.filter((tool) => 'chainId' in ((tool.inputSchema.properties ?? {}) as Record<string, unknown>));
    expect(withChain.length).toBeGreaterThan(0);
    for (const tool of withChain) {
      expect(tool.inputSchema.required ?? [], tool.name).not.toContain('chainId');
      const property = (tool.inputSchema.properties as Record<string, { description?: string }>).chainId!;
      expect(property.description ?? '', tool.name).toMatch(/4663/);
    }
    expect(requested).toHaveLength(0);
  });

  it('reads a contract on 4663 when the call names no chain, and resolves hey://contract/4663/<address>', async () => {
    const requested: URL[] = [];
    const client = await connect(requested);
    const address = '0xcab100000000000000000000000000000000cb07';
    await client.callTool({ name: 'get_contract', arguments: { address } });
    expect(requested.map((url) => url.pathname)).toEqual([`/api/contracts/4663/${address}`]);
    const resource = await client.readResource({ uri: `hey://contract/4663/${address}` });
    expect((resource.contents[0] as { text: string }).text.length).toBeGreaterThan(0);
    expect(requested.map((url) => url.pathname)).toEqual([`/api/contracts/4663/${address}`, `/api/contracts/4663/${address}`]);
  });
});
