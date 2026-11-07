import { describe, expect, it } from 'vitest';

import { hasData } from '../adapter';
import { stubFetch, testContext } from '../testing';
import { createErc20BalancesAdapter, ERC20_BALANCES_BATCH } from './erc20-balances';

const RPC = 'https://rpc.example/';
const TOKEN = '0xe8ffd7e24187f72afb08d75b1bb13088a989a791';
const LOCKER = '0x7b62a8d1ae1d3b5f6e2c8f9c0a3c1d2e4f5a6b7c';
const DEAD = '0x000000000000000000000000000000000000dead';
const word = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}`;

describe('erc20 balances', () => {
  it('reads balanceOf for each address in one batched call, in whole tokens', async () => {
    const stub = stubFetch({
      status: 200,
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, result: word(100_000_000n * 10n ** 18n) },
        { jsonrpc: '2.0', id: 2, result: word(7_100_000n * 10n ** 18n) },
      ]),
    });
    const result = await createErc20BalancesAdapter().fetch(
      { rpcUrl: RPC, token: TOKEN, holders: [LOCKER, DEAD], decimals: 18 },
      testContext({ fetchImpl: stub.fetchImpl }),
    );
    expect(hasData(result)).toBe(true);
    expect(result.data).toEqual([
      { address: LOCKER, amount: 100_000_000 },
      { address: DEAD, amount: 7_100_000 },
    ]);
    const body = JSON.parse(String(stub.requests[0]?.init?.body)) as { params: [{ to: string; data: string }] }[];
    expect(body).toHaveLength(2);
    expect(body[0]!.params[0].to).toBe(TOKEN);
    expect(body[0]!.params[0].data).toBe(`0x70a08231${LOCKER.slice(2).padStart(64, '0')}`);
  });

  it('keeps a measured zero as 0 and leaves out an address that did not answer, never guessing', async () => {
    const stub = stubFetch({
      status: 200,
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, result: word(0n) },
        { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'execution reverted' } },
      ]),
    });
    const result = await createErc20BalancesAdapter().fetch(
      { rpcUrl: RPC, token: TOKEN, holders: [LOCKER, DEAD], decimals: 18 },
      testContext({ fetchImpl: stub.fetchImpl }),
    );
    expect(result.data).toEqual([{ address: LOCKER, amount: 0 }]);
  });

  it('refuses a batch larger than the node answers, a bad address or implausible decimals', () => {
    const adapter = createErc20BalancesAdapter();
    const many = Array.from({ length: ERC20_BALANCES_BATCH + 1 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}`);
    expect(adapter.canHandle({ rpcUrl: RPC, token: TOKEN, holders: many, decimals: 18 })).toBe(false);
    expect(adapter.canHandle({ rpcUrl: RPC, token: TOKEN, holders: ['0x123'], decimals: 18 })).toBe(false);
    expect(adapter.canHandle({ rpcUrl: RPC, token: TOKEN, holders: [LOCKER], decimals: 99 })).toBe(false);
    expect(adapter.canHandle({ rpcUrl: RPC, token: TOKEN, holders: [], decimals: 18 })).toBe(false);
    expect(adapter.canHandle({ rpcUrl: RPC, token: TOKEN, holders: [LOCKER], decimals: 18 })).toBe(true);
  });
});
