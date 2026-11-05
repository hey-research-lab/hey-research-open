import { describe, expect, it } from 'vitest';

import { readFixture, stubFetch, testContext } from '../testing';
import { decodeAggregate3Calls, encodeAggregate3Result, MULTICALL3_ADDRESS } from './multicall';
import { createStockTokenMultiplierBatchAdapter, STOCK_TOKEN_MULTIPLIER_CALLS, wadToDecimal } from './stock-token-multipliers';

/**
 * The fixture is a real `aggregate3` answer from Robinhood Chain (recorded 2026-11-05): AAPL (a dividend multiplier in
 * force), SOXX (an action scheduled for 14:30 UTC that day, which Robinhood's feed did not list), CRWD (a 4:1 split
 * applied in July) and the Multicall3 contract itself, which has none of the three functions.
 */
const AAPL = '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9';
const SOXX = '0x75742c18bc1f1c5c5f448f4c9d9c6f66dafaaa38';
const CRWD = '0xea72ecca2d0f6bfa1394dbbcff85b52cd4233931';
const TOKENS = [AAPL, SOXX, CRWD, MULTICALL3_ADDRESS.toLowerCase()];

describe('createStockTokenMultiplierBatchAdapter', () => {
  it('pins the three selectors', () => {
    // keccak256("uiMultiplier()"), ("newUIMultiplier()"), ("effectiveAt()"), first four bytes (cast sig).
    expect(STOCK_TOKEN_MULTIPLIER_CALLS).toEqual({ uiMultiplier: '0xa60bf13d', newUIMultiplier: '0xdc767007', effectiveAt: '0x97a4064f' });
  });

  it('reads each token’s multiplier in force, the one scheduled and when, in one request', async () => {
    const stub = stubFetch({ status: 200, body: readFixture('rpc-stock-token-multipliers.json') });
    const result = await createStockTokenMultiplierBatchAdapter().fetch({ rpcUrl: 'https://rpc.example', tokens: TOKENS }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.status).toBe('fresh');
    expect(stub.requests).toHaveLength(1);
    const sent = JSON.parse(String(stub.requests[0]!.init?.body ?? '{}')) as { params: [{ to: string; data: string }] };
    expect(sent.params[0].to).toBe(MULTICALL3_ADDRESS);
    expect(decodeAggregate3Calls(sent.params[0].data)).toHaveLength(12);
    expect(result.data).toEqual([
      { token: AAPL, read: { uiMultiplier: '1.000566080061092436', newUIMultiplier: '1.000566080061092436', effectiveAt: 1786720366 } },
      { token: SOXX, read: { uiMultiplier: '1.00045083821042596', newUIMultiplier: '3.00135251463127788', effectiveAt: 1793889000 } },
      { token: CRWD, read: { uiMultiplier: '4', newUIMultiplier: '4', effectiveAt: 1782999000 } },
      // A contract without the functions is left unread, never given a default multiplier.
      { token: MULTICALL3_ADDRESS.toLowerCase() },
    ]);
  });

  it('treats a provider error as no answer, never as tokens with no action', async () => {
    const stub = stubFetch({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } }) });
    const result = await createStockTokenMultiplierBatchAdapter().fetch({ rpcUrl: 'https://rpc.example', tokens: [AAPL] }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.status).not.toBe('fresh');
    expect(result.data).toBeUndefined();
  });

  it('refuses a batch it cannot ask for', async () => {
    const stub = stubFetch({ status: 200, body: '{}' });
    const tooMany = Array.from({ length: 61 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}`);
    const result = await createStockTokenMultiplierBatchAdapter().fetch({ rpcUrl: 'https://rpc.example', tokens: tooMany }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(result.status).not.toBe('fresh');
    expect(stub.requests).toHaveLength(0);
  });

  it('leaves a reading too large to store or date unread, never written or rounded (2026-11-05 security audit, P3-7)', async () => {
    const word = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}`;
    const WAD = 10n ** 18n;
    const token = (ui: bigint, next: bigint, at: bigint) => [ui, next, at].map((value) => ({ success: true, returnData: word(value) }));
    const result = encodeAggregate3Result([
      ...token(WAD, 3n * WAD, 1_793_889_000n),
      ...token(10n ** 20n * WAD, WAD, 1n),
      ...token(WAD, WAD, 8_640_000_000_001n),
    ]);
    const stub = stubFetch({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) });
    const tokens = [AAPL, SOXX, CRWD];
    const read = await createStockTokenMultiplierBatchAdapter().fetch({ rpcUrl: 'https://rpc.example', tokens }, testContext({ fetchImpl: stub.fetchImpl }));
    expect(read.data).toEqual([{ token: AAPL, read: { uiMultiplier: '1', newUIMultiplier: '3', effectiveAt: 1_793_889_000 } }, { token: SOXX }, { token: CRWD }]);
  });

  it('writes a fixed-point multiplier as exact decimal text', () => {
    expect(wadToDecimal(10n ** 18n)).toBe('1');
    expect(wadToDecimal(3_001_352_514_631_277_880n)).toBe('3.00135251463127788');
    expect(wadToDecimal(500_000_000_000_000_000n)).toBe('0.5');
  });
});
