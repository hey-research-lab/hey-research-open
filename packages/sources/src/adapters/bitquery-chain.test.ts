import { describe, expect, it, vi } from 'vitest';

import { ChainNotRuledError } from '@hey/config/chains';
import { ROBINHOOD_CHAIN_ID } from '@hey/config/constants';

import * as sources from '../index';
import { BITQUERY_CHAIN_ID, bitqueryHomeChainOnly } from './bitquery';

/**
 * I12 (multichain WP1.8, 2026-11-12): every Bitquery adapter refuses any chain but Robinhood Chain (D12: no Bitquery on
 * a new chain). `canHandle` answers false, and `fetch` throws `ChainNotRuledError` before a request is sent or a point
 * is spent. An input that names no chain is Robinhood Chain's, so every caller of today is unchanged.
 */
type AnyAdapter = { name: string; canHandle(input: unknown): boolean; fetch(input: unknown, ctx: unknown): Promise<unknown> };
const factories = Object.entries(sources).filter(
  (entry): entry is [string, () => AnyAdapter] => /^createBitquery\w*Adapter$/.test(entry[0]) && typeof entry[1] === 'function',
);

describe('Bitquery adapters are Robinhood Chain only (I12)', () => {
  it('reads Robinhood Chain and finds every adapter factory', () => {
    expect(BITQUERY_CHAIN_ID).toBe(ROBINHOOD_CHAIN_ID);
    expect(factories.map(([name]) => name).sort()).toEqual([
      'createBitqueryChainDaysAdapter',
      'createBitqueryContractActivityAdapter',
      // The contract control watch (2026-11-22, Terminal holder value lane E).
      'createBitqueryControlEventsAdapter',
      'createBitqueryCreationsAdapter',
      'createBitqueryDeploymentAdapter',
      'createBitqueryDiscoveryAdapter',
      'createBitqueryHolderGraphAdapter',
      'createBitqueryHoldersAdapter',
      'createBitqueryMethodDaysAdapter',
      'createBitqueryOhlcAdapter',
      'createBitqueryPoolsAdapter',
      'createBitqueryRecentCreationsAdapter',
      'createBitquerySurfaceAdapter',
      'createBitqueryTradeDaysAdapter',
      'createBitqueryTradesAdapter',
      'createBitqueryUpgradesAdapter',
    ]);
  });

  it.each(factories)('%s refuses Base and Ethereum before any request', async (_name, create) => {
    const adapter = create();
    const fetchImpl = vi.fn(async () => {
      throw new Error('no request may be sent');
    });
    const ctx = { timeoutMs: 1_000, fetchImpl, now: () => new Date('2026-11-12T00:00:00Z') };
    for (const chainId of [8453, 1]) {
      expect(adapter.canHandle({ chainId, apiKey: 'k', addresses: [], address: '0x' })).toBe(false);
      await expect(adapter.fetch({ chainId, apiKey: 'k' }, ctx)).rejects.toBeInstanceOf(ChainNotRuledError);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes an input that names no chain, or Robinhood Chain, to the adapter it wraps', async () => {
    const inner = { name: 'probe', canHandle: vi.fn(() => true), fetch: vi.fn(async () => ({ status: 'fresh' as const, data: 1, fetchedAt: new Date(), sourceUrl: 'x', cacheTtlSeconds: 0 })) };
    const wrapped = bitqueryHomeChainOnly(inner);
    expect(wrapped.canHandle({})).toBe(true);
    expect(wrapped.canHandle({ chainId: ROBINHOOD_CHAIN_ID })).toBe(true);
    expect(wrapped.canHandle({ chainId: 8453 })).toBe(false);
    await wrapped.fetch({}, { timeoutMs: 1 });
    await wrapped.fetch({ chainId: ROBINHOOD_CHAIN_ID }, { timeoutMs: 1 });
    expect(inner.fetch).toHaveBeenCalledTimes(2);
    await expect(wrapped.fetch({ chainId: 8453 }, { timeoutMs: 1 })).rejects.toThrow(/the Bitquery probe adapter has no ruling for chain 8453/);
    expect(inner.fetch).toHaveBeenCalledTimes(2);
  });
});
