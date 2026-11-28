import { describe, expect, it } from 'vitest';

import { hasData } from '../adapter';
import { readFixture, stubFetch, testContext } from '../testing';
import { BITQUERY_POINTS } from './bitquery';
import { BITQUERY_CONTROL_QUERIES, CONTROL_EVENT_NAMES, CONTROL_EVENT_SIGNATURES, createBitqueryControlEventsAdapter } from './bitquery-control-events';

const TOKEN = '0xc0a7000000000000000000000000000000000a01';
const PROXY = '0xc0a7000000000000000000000000000000000b02';
const TIMELOCK = '0xc0a7000000000000000000000000000000000c03';
const COMPOUND = '0xc0a7000000000000000000000000000000000d04';
const ZERO = '0x0000000000000000000000000000000000000000';

const read = async (addresses: string[], dataset: 'realtime' | 'combined' = 'realtime') => {
  const stub = stubFetch({ status: 200, body: readFixture('bitquery-control-events.json'), headers: { 'content-type': 'application/json' } });
  const result = await createBitqueryControlEventsAdapter().fetch(
    { addresses, apiKey: 'k', dataset, since: new Date('2026-04-30T00:00:00Z') },
    testContext({ fetchImpl: stub.fetchImpl }),
  );
  return { result, stub };
};

describe('bitquery contract control events (2026-11-22, the contract control watch)', () => {
  it('reads ownership, proxy admin and timelock logs in chain order, with their evidence', async () => {
    const { result } = await read([TOKEN, PROXY, TIMELOCK, COMPOUND]);
    expect(hasData(result)).toBe(true);
    if (!hasData(result)) return;
    expect(result.data.map((event) => [event.address, event.kind, event.blockNumber, event.logIndex])).toEqual([
      [TOKEN, 'OWNERSHIP_TRANSFERRED', 1_100_000, 0],
      [PROXY, 'ADMIN_CHANGED', 20_000_000, 1],
      [TOKEN, 'OWNERSHIP_TRANSFERRED', 88_000_000, 3],
      [TOKEN, 'OWNERSHIP_TRANSFER_STARTED', 104_600_000, 9],
      [COMPOUND, 'TIMELOCK_SCHEDULED', 104_800_000, 1],
      [TIMELOCK, 'TIMELOCK_SCHEDULED', 105_000_000, 7],
      [TIMELOCK, 'TIMELOCK_CANCELLED', 105_200_000, 0],
      [TIMELOCK, 'TIMELOCK_EXECUTED', 105_600_000, 2],
    ]);
  });

  it('keeps the zero address as a fact (set at deployment, renounced) and reads names, or positions when the cube gives none', async () => {
    const { result } = await read([TOKEN, PROXY]);
    if (!hasData(result)) throw new Error('no data');
    const [deployed, admin, renounced] = result.data;
    expect(deployed).toMatchObject({ previous: ZERO, next: '0x1111111111111111111111111111111111111111', eventName: 'OwnershipTransferred' });
    expect(renounced).toMatchObject({ previous: '0x1111111111111111111111111111111111111111', next: ZERO });
    // AdminChanged came with no argument names: read by the signature's positions.
    expect(admin).toMatchObject({ previous: '0x2222222222222222222222222222222222222222', next: TIMELOCK, txHash: '0xc0a7000000000000000000000000000000000000000000000000000000000003' });
  });

  it('reads a timelock operation’s id, target, selector and delay — bytes as bare hex, as the cube answers — and Compound’s signature and eta', async () => {
    const { result } = await read([TIMELOCK, COMPOUND]);
    if (!hasData(result)) throw new Error('no data');
    const scheduled = result.data.find((event) => event.address === TIMELOCK && event.kind === 'TIMELOCK_SCHEDULED');
    expect(scheduled).toMatchObject({
      operationId: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
      target: PROXY,
      selector: '0x3659cfe6',
      delaySeconds: 172_800,
    });
    const executed = result.data.find((event) => event.kind === 'TIMELOCK_EXECUTED');
    expect(executed?.operationId).toBe(scheduled?.operationId);
    const queued = result.data.find((event) => event.address === COMPOUND);
    expect(queued).toMatchObject({ eventName: 'QueueTransaction', signature: 'upgradeTo(address)', eta: new Date(1_764_000_000 * 1000), target: '0x5555555555555555555555555555555555555555' });
    // Compound's data carries no selector when the signature names the function.
    expect(queued).not.toHaveProperty('selector');
  });

  it('never reads another contract’s same-named event as a timelock’s, and drops a log with no time or nobody asked about', async () => {
    const { result } = await read([TOKEN]);
    if (!hasData(result)) throw new Error('no data');
    // `Cancelled(uint256)` (an order book) and a name-only `Cancelled` carrying an address are not `Cancelled(bytes32)`.
    expect(result.data.filter((event) => event.kind === 'TIMELOCK_CANCELLED')).toEqual([]);
    // Nor is a multicall's `CallExecuted(address,bool,bytes)` a timelock's (seen on production, 2026-11-22).
    const { result: timelock } = await read([TIMELOCK]);
    if (!hasData(timelock)) throw new Error('no data');
    expect(timelock.data.some((event) => event.blockNumber === 105_240_000)).toBe(false);
    expect(result.data.some((event) => event.blockNumber === 105_300_000)).toBe(false);
    expect(result.data.every((event) => event.address === TOKEN)).toBe(true);
  });

  it('asks the Events cube by name for the contracts given, selects no sender, and is never cached', async () => {
    const { result, stub } = await read([TOKEN], 'realtime');
    expect(result.cacheTtlSeconds).toBe(0);
    const body = JSON.parse(String(stub.requests[0]?.init?.body)) as { query: string; variables: { addresses: string[]; since: string } };
    expect(body.query).toBe(BITQUERY_CONTROL_QUERIES.realtime);
    expect(body.variables.addresses).toEqual([TOKEN]);
    for (const query of Object.values(BITQUERY_CONTROL_QUERIES)) {
      expect(query).toMatch(/\bEvents\s*\(/);
      expect(query).not.toMatch(/\b(Transfers|Transactions|DEXPoolEvents|BalanceUpdates|Holders|Balances)\s*\(/);
      expect(query).not.toMatch(/\bFrom\b/);
      for (const name of CONTROL_EVENT_NAMES) expect(query).toContain(JSON.stringify(name));
    }
    expect(BITQUERY_CONTROL_QUERIES.combined).toContain('dataset: combined');
    expect(BITQUERY_CONTROL_QUERIES.realtime).toContain('dataset: realtime');
    expect(result.meteredUnits).toBe(BITQUERY_POINTS.perRealtimeCube);
  });

  it('refuses a read from genesis on realtime, which holds about four days', () => {
    const adapter = createBitqueryControlEventsAdapter();
    expect(adapter.canHandle({ addresses: [TOKEN], apiKey: 'k', dataset: 'realtime' })).toBe(false);
    expect(adapter.canHandle({ addresses: [TOKEN], apiKey: 'k', dataset: 'combined' })).toBe(true);
    expect(adapter.canHandle({ addresses: ['nope'], apiKey: 'k', dataset: 'combined' })).toBe(false);
  });

  it('names every signature it reads exactly once, each with its kind', () => {
    expect(Object.keys(CONTROL_EVENT_SIGNATURES)).toHaveLength(9);
    expect(new Set(CONTROL_EVENT_NAMES).size).toBe(9);
  });
});
