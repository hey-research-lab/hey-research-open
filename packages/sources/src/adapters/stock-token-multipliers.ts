import { z } from 'zod';

import { errorResult, type SourceAdapter, type SourceContext, type SourceResult } from '../adapter';
import { performSourceFetch } from '../http/perform';
import { decodeAggregate3, encodeAggregate3, MULTICALL3_ADDRESS, type Call3, type Call3Result } from './multicall';

/**
 * A Stock Token's shares-per-token multiplier, read from the token itself (2026-11-05, founder "buat multiplier stock
 * token baca dari chain").
 *
 * Robinhood's Stock Tokens implement ERC-8056 "scaled UI" (`ERC20ScaledUIUpgradeable`, the one `Stock` implementation
 * behind every token's beacon): `uiMultiplier()` is the multiplier in force, `newUIMultiplier()` the one last scheduled
 * and `effectiveAt()` the time it takes effect, all 18-decimal fixed point except the time. A corporate action is
 * scheduled while `effectiveAt` is still ahead and the new multiplier differs from the one in force. Robinhood's feed
 * can leave such an action out (SOXX on 2026-11-05: 3.0013 scheduled on chain for 14:30 UTC, nothing pending in the
 * feed), so HEY reads the contract too.
 *
 * Three calls a token through Multicall3, sixty tokens to a request. A token answers whole or not at all: a token whose
 * three calls do not all succeed is left unread, never given a default. An RPC failure is an error for the batch and
 * nothing is written from it.
 */
export const STOCK_TOKEN_MULTIPLIER_CALLS = { uiMultiplier: '0xa60bf13d', newUIMultiplier: '0xdc767007', effectiveAt: '0x97a4064f' } as const;
export const STOCK_TOKEN_MULTIPLIER_BATCH_SIZE = 60;

export type StockTokenMultiplierBatchInput = { rpcUrl: string; tokens: readonly string[] };

/** One entry per token asked, in order; `read` is absent when the token did not answer all three calls. */
export type StockTokenMultiplierValue = {
  token: string;
  read?: {
    /** Exact decimal text, e.g. `1`, `4`, `1.000566`. */
    uiMultiplier: string;
    newUIMultiplier: string;
    /** Unix seconds; 0 when nothing was ever scheduled. */
    effectiveAt: number;
  };
};

const WAD = 10n ** 18n;

/** An 18-decimal fixed-point word as exact decimal text, trailing zeros trimmed. */
export function wadToDecimal(value: bigint): string {
  const whole = value / WAD;
  const fraction = (value % WAD).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** One ABI uint256 word, or undefined when the answer is not exactly one word. */
export function decodeUint256(hex: string): bigint | undefined {
  const data = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (data.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(data)) return undefined;
  return BigInt(`0x${data}`);
}

function readToken(entries: readonly (Call3Result | undefined)[]): StockTokenMultiplierValue['read'] | undefined {
  const [ui, next, at] = entries.map((entry) => (entry?.success ? decodeUint256(entry.returnData) : undefined));
  if (ui === undefined || next === undefined || at === undefined) return undefined;
  if (ui === 0n || next === 0n || at > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  return { uiMultiplier: wadToDecimal(ui), newUIMultiplier: wadToDecimal(next), effectiveAt: Number(at) };
}

const envelopeSchema = z.object({
  result: z.string().optional(),
  error: z.object({ code: z.number().optional(), message: z.string() }).optional(),
});

export function createStockTokenMultiplierBatchAdapter(): SourceAdapter<StockTokenMultiplierBatchInput, StockTokenMultiplierValue[]> {
  return {
    name: 'stock-token-multipliers',

    canHandle(input) {
      return (
        Boolean(input.rpcUrl) &&
        input.tokens.length > 0 &&
        input.tokens.length <= STOCK_TOKEN_MULTIPLIER_BATCH_SIZE &&
        input.tokens.every((token) => /^0x[a-fA-F0-9]{40}$/.test(token))
      );
    },

    async fetch(input, ctx: SourceContext): Promise<SourceResult<StockTokenMultiplierValue[]>> {
      if (!this.canHandle(input)) return errorResult(ctx, 'INVALID_RESPONSE', 'a batch needs one to sixty well-formed token addresses; nothing was asked');
      const calls: Call3[] = input.tokens.flatMap((token) =>
        Object.values(STOCK_TOKEN_MULTIPLIER_CALLS).map((callData) => ({ target: token, allowFailure: true, callData })),
      );
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: MULTICALL3_ADDRESS, data: encodeAggregate3(calls) }, 'latest'],
      });

      return performSourceFetch(
        ctx,
        { url: input.rpcUrl, method: 'POST', body, headers: { 'content-type': 'application/json' }, conditional: false },
        {
          schema: envelopeSchema.superRefine((value, context) => {
            // A provider error is not evidence that sixty tokens have no multiplier.
            if (value.error) context.addIssue({ code: z.ZodIssueCode.custom, message: `rpc error: ${value.error.message}` });
            else if (!value.result || decodeAggregate3(value.result)?.length !== calls.length) {
              context.addIssue({ code: z.ZodIssueCode.custom, message: value.result === '0x' ? 'no multicall contract answered' : 'aggregate3 answer did not decode' });
            }
          }),
          parse: (raw) => JSON.parse(raw) as unknown,
          // A scheduled action can be set at any time: never reuse an old answer for long.
          cacheTtlSeconds: 60,
          normalize: (raw): StockTokenMultiplierValue[] => {
            const results = decodeAggregate3(raw.result ?? '') ?? [];
            return input.tokens.map((token, index) => {
              const read = readToken(results.slice(index * 3, index * 3 + 3));
              return { token: token.toLowerCase(), ...(read ? { read } : {}) };
            });
          },
        },
      );
    },
  };
}
