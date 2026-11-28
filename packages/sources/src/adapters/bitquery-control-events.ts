import { z } from 'zod';

import { type SourceAdapter, type SourceContext, type SourceResult } from '../adapter';
import { performSourceFetch } from '../http/perform';
import { BITQUERY_DEFAULT_BASE_URL, BITQUERY_NETWORK, BITQUERY_POINTS, bitqueryAnswerError, withBitqueryPoints, bitqueryHomeChainOnly, type BitqueryChainInput } from './bitquery';

/**
 * Who can change a contract, as its own logs say (2026-11-22, founder ruling under delegation, Terminal holder value
 * lane E: the contract control watch).
 *
 * Four families of log, each a contract-level fact the contract emitted about itself:
 *
 *  - `OwnershipTransferred(address,address)` and `OwnershipTransferStarted(address,address)` — OpenZeppelin's
 *    `Ownable` and `Ownable2Step`: the account or contract that may call the owner-only functions moved, or a move was
 *    proposed and waits for the new owner to accept it.
 *  - `AdminChanged(address,address)` — EIP-1967: the address that may upgrade a transparent proxy moved.
 *  - `CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)`, `CallExecuted(bytes32,uint256,address,
 *    uint256,bytes)` and `Cancelled(bytes32)` — OpenZeppelin's `TimelockController`: an operation queued with its delay,
 *    run, or withdrawn.
 *  - `QueueTransaction`, `ExecuteTransaction` and `CancelTransaction(bytes32,address,uint256,string,bytes,uint256)` —
 *    Compound's `Timelock`, the same three steps with the time it may run (`eta`) on the log.
 *
 * Field names probed read-only on production (2026-11-22): `Log.Signature.Signature` carries the canonical signature
 * (`CallExecuted(bytes32,uint256,address,uint256,bytes)`), the argument fragments below all exist, and another
 * contract's `CallExecuted(address,bool,bytes)` (a multicall) shares the name — the full signature keeps it out.
 *
 * Read for the contracts HEY already watches as a project's own (the caller passes them), never chain-wide: `Events` is
 * in the archive grant (`BITQUERY_ARCHIVE_CUBES`), so `combined` answers back to genesis for the first read and a
 * catch-up, and `realtime` (about four days, five points a request) answers the routine read. Asked by name and
 * checked by full signature when the cube gives one, so a contract's unrelated `Cancelled` event is never read as a
 * timelock's.
 *
 * What comes back names accounts — a new owner can be a person's address — so this answer is **never cached** and the
 * domain decides, in memory, what may be kept: the kind of the new owner (a contract, an address with no code, the
 * zero address) and an address only when it is one of the same project's own contracts (machine rule 12, product
 * rule 1 as amended 2026-09-25). Nothing here is a profile of an address.
 *
 * An argument the cube did not decode is unknown, never a zero address; a log missing its block, position, time or
 * contract is dropped rather than patched.
 */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO = /^0x0{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;

/** Contracts per request, as the upgrade read (`BITQUERY_UPGRADE_BATCH`). */
export const BITQUERY_CONTROL_BATCH = 1_200;

/** The document's row limit; an answer this long may be cut, and the caller halves the batch. */
export const BITQUERY_CONTROL_ROW_LIMIT = 5_000;

export const CONTROL_EVENT_KINDS = [
  'OWNERSHIP_TRANSFERRED',
  'OWNERSHIP_TRANSFER_STARTED',
  'ADMIN_CHANGED',
  'TIMELOCK_SCHEDULED',
  'TIMELOCK_EXECUTED',
  'TIMELOCK_CANCELLED',
] as const;
export type ControlEventKind = (typeof CONTROL_EVENT_KINDS)[number];

type ArgSpec = { name: string; type: 'address' | 'bytes32' | 'uint256' | 'bytes' | 'string' };

/** Every log the watch reads, by its canonical signature: the kind it is and its arguments in order. */
export const CONTROL_EVENT_SIGNATURES: Readonly<Record<string, { name: string; kind: ControlEventKind; args: readonly ArgSpec[] }>> = {
  'OwnershipTransferred(address,address)': {
    name: 'OwnershipTransferred',
    kind: 'OWNERSHIP_TRANSFERRED',
    args: [
      { name: 'previousOwner', type: 'address' },
      { name: 'newOwner', type: 'address' },
    ],
  },
  'OwnershipTransferStarted(address,address)': {
    name: 'OwnershipTransferStarted',
    kind: 'OWNERSHIP_TRANSFER_STARTED',
    args: [
      { name: 'previousOwner', type: 'address' },
      { name: 'newOwner', type: 'address' },
    ],
  },
  'AdminChanged(address,address)': {
    name: 'AdminChanged',
    kind: 'ADMIN_CHANGED',
    args: [
      { name: 'previousAdmin', type: 'address' },
      { name: 'newAdmin', type: 'address' },
    ],
  },
  'CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)': {
    name: 'CallScheduled',
    kind: 'TIMELOCK_SCHEDULED',
    args: [
      { name: 'id', type: 'bytes32' },
      { name: 'index', type: 'uint256' },
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'predecessor', type: 'bytes32' },
      { name: 'delay', type: 'uint256' },
    ],
  },
  'CallExecuted(bytes32,uint256,address,uint256,bytes)': {
    name: 'CallExecuted',
    kind: 'TIMELOCK_EXECUTED',
    args: [
      { name: 'id', type: 'bytes32' },
      { name: 'index', type: 'uint256' },
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  },
  'Cancelled(bytes32)': { name: 'Cancelled', kind: 'TIMELOCK_CANCELLED', args: [{ name: 'id', type: 'bytes32' }] },
  'QueueTransaction(bytes32,address,uint256,string,bytes,uint256)': {
    name: 'QueueTransaction',
    kind: 'TIMELOCK_SCHEDULED',
    args: [
      { name: 'txHash', type: 'bytes32' },
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'signature', type: 'string' },
      { name: 'data', type: 'bytes' },
      { name: 'eta', type: 'uint256' },
    ],
  },
  'ExecuteTransaction(bytes32,address,uint256,string,bytes,uint256)': {
    name: 'ExecuteTransaction',
    kind: 'TIMELOCK_EXECUTED',
    args: [
      { name: 'txHash', type: 'bytes32' },
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'signature', type: 'string' },
      { name: 'data', type: 'bytes' },
      { name: 'eta', type: 'uint256' },
    ],
  },
  'CancelTransaction(bytes32,address,uint256,string,bytes,uint256)': {
    name: 'CancelTransaction',
    kind: 'TIMELOCK_CANCELLED',
    args: [
      { name: 'txHash', type: 'bytes32' },
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'signature', type: 'string' },
      { name: 'data', type: 'bytes' },
      { name: 'eta', type: 'uint256' },
    ],
  },
};

const SIGNATURES_BY_NAME = new Map(Object.entries(CONTROL_EVENT_SIGNATURES).map(([signature, spec]) => [spec.name, { signature, ...spec }]));
export const CONTROL_EVENT_NAMES = [...SIGNATURES_BY_NAME.keys()];

export type BitqueryControlDataset = 'realtime' | 'combined';

function controlQuery(dataset: BitqueryControlDataset): string {
  const names = CONTROL_EVENT_NAMES.map((name) => JSON.stringify(name)).join(', ');
  return `query HeyControlEvents($addresses: [String!], $since: DateTime) {
  EVM(network: ${BITQUERY_NETWORK}, dataset: ${dataset}) {
    Events(
      where: { Block: { Time: { since: $since } }, Log: { SmartContract: { in: $addresses }, Signature: { Name: { in: [${names}] } } } }
      limit: { count: ${BITQUERY_CONTROL_ROW_LIMIT} }
      orderBy: { ascending: Block_Number }
    ) {
      Block { Time Number }
      Transaction { Hash }
      Log { SmartContract Index Signature { Name Signature } }
      Arguments {
        Name
        Type
        Value {
          ... on EVM_ABI_Address_Value_Arg { address }
          ... on EVM_ABI_BigInt_Value_Arg { bigInteger }
          ... on EVM_ABI_Integer_Value_Arg { integer }
          ... on EVM_ABI_Bytes_Value_Arg { hex }
          ... on EVM_ABI_String_Value_Arg { string }
        }
      }
    }
  }
}`;
}

/** The two documents, one per dataset; the realtime one is the routine read. */
export const BITQUERY_CONTROL_QUERIES: Readonly<Record<BitqueryControlDataset, string>> = {
  realtime: controlQuery('realtime'),
  combined: controlQuery('combined'),
};

const numberish = z.union([z.string(), z.number()]).nullish();

const argSchema = z.object({
  Name: z.string().nullish(),
  Type: z.string().nullish(),
  Value: z
    .object({
      address: z.string().nullish(),
      bigInteger: numberish,
      integer: numberish,
      hex: z.string().nullish(),
      string: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
});

const rowSchema = z.object({
  Block: z.object({ Time: z.string().nullish(), Number: numberish }).nullish(),
  Transaction: z.object({ Hash: z.string().nullish() }).nullish(),
  Log: z
    .object({
      SmartContract: z.string().nullish(),
      Index: numberish,
      Signature: z.object({ Name: z.string().nullish(), Signature: z.string().nullish() }).nullish(),
    })
    .nullish(),
  Arguments: z.array(argSchema).nullish(),
});

const responseSchema = z.object({
  data: z.object({ EVM: z.object({ Events: z.array(rowSchema).nullish() }).nullish() }).nullish(),
  errors: z.array(z.object({ message: z.string() })).nullish(),
});

export type BitqueryControlInput = {
  addresses: readonly string[];
  apiKey: string;
  dataset: BitqueryControlDataset;
  /** Logs in blocks at or after this time; absent reads from genesis (only with `combined`). */
  since?: Date;
  baseUrl?: string;
};

/**
 * One control log, in memory. `previous`/`next` are the old and new owner or admin, lower-cased, the zero address kept
 * as `0x000…0` (it means "renounced" or "set at deployment"); absent when the cube did not decode them. The domain
 * decides which, if any, may be stored.
 */
export type BitqueryControlEvent = {
  /** The contract that emitted the log, lower-cased. */
  address: string;
  kind: ControlEventKind;
  eventName: string;
  blockNumber: number;
  logIndex: number;
  txHash?: string;
  occurredAt: Date;
  previous?: string;
  next?: string;
  /** A timelock operation's id (OpenZeppelin `id`, Compound `txHash`), lower-cased bytes32. */
  operationId?: string;
  /** The contract a timelock operation calls. */
  target?: string;
  /** The first four bytes of the call a timelock operation makes, `0x` and eight hex digits. */
  selector?: string;
  /** Compound's function signature string, when it is one (`upgradeTo(address)`). */
  signature?: string;
  /** OpenZeppelin's delay in seconds. */
  delaySeconds?: number;
  /** Compound's `eta`: when the operation may run. */
  eta?: Date;
};

type Row = z.infer<typeof rowSchema>;
type Arg = z.infer<typeof argSchema>;

const int = (value: string | number | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

/** Ten years in seconds: a delay or an eta past this is not a time HEY prints. */
const MAX_SECONDS = 10 * 365 * 86_400;
/** 2100-01-01 in unix seconds. */
const MAX_ETA = 4_102_444_800;

const addressOrZero = (value: string | null | undefined): string | undefined => {
  const out = value?.toLowerCase();
  return out && ADDRESS.test(out) ? out : undefined;
};
const contractAddress = (value: string | null | undefined): string | undefined => {
  const out = addressOrZero(value);
  return out && !ZERO.test(out) ? out : undefined;
};

/** A plain Solidity signature, short: `name(type,…)`; anything else is not repeated. */
const SIGNATURE_TEXT = /^[A-Za-z_][A-Za-z0-9_]{0,63}\([A-Za-z0-9_,[\]() ]{0,120}\)$/;

/** The argument by name, else by position when the cube left the names out and the count matches the signature. */
function argumentOf(args: readonly Arg[], spec: readonly ArgSpec[], name: string): Arg | undefined {
  const named = args.find((arg) => arg.Name === name);
  if (named) return named;
  if (args.some((arg) => arg.Name)) return undefined;
  const index = spec.findIndex((entry) => entry.name === name);
  return index >= 0 && args.length === spec.length ? args[index] : undefined;
}

/**
 * A bytes argument, `0x`-prefixed and lower-cased. The cube answers bytes as bare hex with no `0x` (probed on production,
 * 2026-11-22: `CallExecuted` ids and call data), so both spellings are read.
 */
const hexOf = (arg: Arg | undefined): string | undefined => {
  const raw = arg?.Value?.hex ?? arg?.Value?.string ?? undefined;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const value = /^0x/i.test(raw) ? raw : `0x${raw}`;
  return HEX.test(value) ? value.toLowerCase() : undefined;
};
const uintOf = (arg: Arg | undefined): number | undefined => {
  const value = arg?.Value?.bigInteger ?? arg?.Value?.integer ?? undefined;
  if (value === null || value === undefined) return undefined;
  const text = String(value);
  if (!/^[0-9]{1,15}$/.test(text)) return undefined;
  return Number(text);
};

/**
 * Which log a row is: the full signature when the cube gives one (and it must be on the list), else the name, whose
 * arguments must then match the signature's count and kinds.
 */
function specOf(row: Row): (typeof CONTROL_EVENT_SIGNATURES)[string] | undefined {
  const full = row.Log?.Signature?.Signature?.replace(/\s+/g, '');
  if (full) return CONTROL_EVENT_SIGNATURES[full];
  const byName = SIGNATURES_BY_NAME.get(row.Log?.Signature?.Name ?? '');
  if (!byName) return undefined;
  const args = row.Arguments ?? [];
  if (args.length !== byName.args.length) return undefined;
  // A same-named event with other argument kinds is another contract's own event, never a timelock's or an owner's.
  const kindsMatch = byName.args.every((spec, index) => {
    const value = args[index]?.Value;
    if (!value) return true;
    if (spec.type === 'address') return typeof value.address === 'string';
    if (spec.type === 'uint256') return value.bigInteger !== undefined || value.integer !== undefined;
    return typeof value.hex === 'string' || typeof value.string === 'string';
  });
  return kindsMatch ? byName : undefined;
}

/** One event per log, in chain order, for the contracts asked about only. */
export function normalizeBitqueryControlEvents(rows: readonly Row[] | null | undefined, addresses: readonly string[]): BitqueryControlEvent[] {
  const wanted = new Set(addresses.map((address) => address.toLowerCase()));
  const out: BitqueryControlEvent[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const address = contractAddress(row.Log?.SmartContract);
    const blockNumber = int(row.Block?.Number);
    const logIndex = int(row.Log?.Index);
    const occurredAt = row.Block?.Time ? new Date(row.Block.Time) : undefined;
    if (!address || !wanted.has(address)) continue;
    if (blockNumber === undefined || logIndex === undefined || !occurredAt || Number.isNaN(occurredAt.getTime())) continue;
    const spec = specOf(row);
    if (!spec) continue;
    const key = `${address}:${blockNumber}:${logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const args = row.Arguments ?? [];
    const arg = (name: string) => argumentOf(args, spec.args, name);
    const event: BitqueryControlEvent = {
      address,
      kind: spec.kind,
      eventName: spec.name,
      blockNumber,
      logIndex,
      occurredAt,
      ...(row.Transaction?.Hash && /^0x[0-9a-fA-F]{64}$/.test(row.Transaction.Hash) ? { txHash: row.Transaction.Hash.toLowerCase() } : {}),
    };
    if (spec.kind === 'OWNERSHIP_TRANSFERRED' || spec.kind === 'OWNERSHIP_TRANSFER_STARTED' || spec.kind === 'ADMIN_CHANGED') {
      const [previousName, nextName] = [spec.args[0]!.name, spec.args[1]!.name];
      const previous = addressOrZero(arg(previousName)?.Value?.address);
      const next = addressOrZero(arg(nextName)?.Value?.address);
      if (previous) event.previous = previous;
      if (next) event.next = next;
    } else {
      const operation = hexOf(arg(spec.args[0]!.name));
      if (operation && BYTES32.test(operation)) event.operationId = operation;
      const target = contractAddress(arg('target')?.Value?.address);
      if (target) event.target = target;
      const data = hexOf(arg('data'));
      const signature = arg('signature')?.Value?.string?.replace(/\s+/g, '');
      if (signature && SIGNATURE_TEXT.test(signature)) event.signature = signature;
      // Compound's call data carries no selector when the signature names the function.
      if (data && data.length >= 10 && !event.signature) event.selector = data.slice(0, 10);
      const delay = uintOf(arg('delay'));
      if (delay !== undefined && delay <= MAX_SECONDS) event.delaySeconds = delay;
      const eta = uintOf(arg('eta'));
      if (eta !== undefined && eta > 0 && eta <= MAX_ETA) event.eta = new Date(eta * 1000);
    }
    out.push(event);
  }
  return out.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

/** Robinhood Chain only (multichain I12, D12: no Bitquery on a new chain): another chain is refused before any request. */
export function createBitqueryControlEventsAdapter(): SourceAdapter<BitqueryChainInput & BitqueryControlInput, BitqueryControlEvent[]> {
  return bitqueryHomeChainOnly({
    name: 'bitquery',
    canHandle: (input) =>
      input.addresses.length > 0 &&
      input.addresses.length <= BITQUERY_CONTROL_BATCH &&
      input.addresses.every((address) => ADDRESS.test(address)) &&
      input.apiKey.length > 0 &&
      // Realtime holds about four days: a read from genesis must ask the archive.
      (input.dataset === 'combined' || input.since !== undefined),
    async fetch(input, ctx: SourceContext): Promise<SourceResult<BitqueryControlEvent[]>> {
      const addresses = [...new Set(input.addresses.map((address) => address.toLowerCase()))];
      return withBitqueryPoints(
        await performSourceFetch(
          ctx,
          {
            url: input.baseUrl ?? BITQUERY_DEFAULT_BASE_URL,
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` },
            body: JSON.stringify({
              query: BITQUERY_CONTROL_QUERIES[input.dataset],
              variables: { addresses, since: (input.since ?? new Date('2026-04-30T00:00:00Z')).toISOString() },
            }),
            allowedContentTypes: ['application/json'],
          },
          {
            schema: responseSchema,
            parse: (body) => JSON.parse(body),
            // Never cached: the answer names accounts the domain reads in memory only.
            cacheTtlSeconds: 0,
            normalize: (response) => {
              if (response.errors?.length) throw bitqueryAnswerError(response.errors);
              return normalizeBitqueryControlEvents(response.data?.EVM?.Events, addresses);
            },
          },
        ),
        input.dataset === 'realtime' ? BITQUERY_POINTS.perRealtimeCube : BITQUERY_POINTS.controlCombined,
      );
    },
  });
}
