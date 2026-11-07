import { z } from 'zod';

import { type SourceAdapter, type SourceContext, type SourceResult } from '../adapter';
import { performSourceFetch } from '../http/perform';
import { wholeTokens } from './erc20-supply';

/**
 * One token's balance at a few known addresses, read from the token itself (2026-11-07).
 *
 * Written because the holder source answers from a recent window: an address whose balance has not changed for about
 * nine days is simply absent. On $DELTA that left out the HoodLock locker holding 10% of supply and every day's figures
 * were withheld as `partial_balances`. The distribution sweep asks this adapter only for addresses HEY already names as
 * infrastructure (lockers, burn addresses, pools, the token itself), so a dormant locker is listed with its true balance.
 *
 * `balanceOf(address)` per address, batched in one JSON-RPC request. A balance that does not answer is absent from the
 * result, never 0: unknown is not empty. Never an address list of holders, never a person (CLAUDE.md product rule 1).
 */
export type Erc20BalancesInput = {
  rpcUrl: string;
  /** The token contract. */
  token: string;
  /** Known infrastructure addresses to read, at most `ERC20_BALANCES_BATCH`. */
  holders: readonly string[];
  /** The token's decimals, from the supply read (balances arrive in whole tokens, like the holder source's). */
  decimals: number;
};

export type Erc20Balance = {
  address: string;
  /** Whole tokens, decimals applied. */
  amount: number;
};

/** `balanceOf(address)`. */
const BALANCE_OF = '0x70a08231';
/** The public node counts the calls inside a batch; twenty matches the supply batch's measured margin. */
export const ERC20_BALANCES_BATCH = 20;
/** Balances move; the sweep reads once a token a day, so a short cache only spares a retry. */
const CACHE_TTL_SECONDS = 300;

const envelopeSchema = z.object({
  id: z.union([z.number(), z.string()]).nullish(),
  result: z.string().optional(),
  error: z.object({ code: z.number().optional(), message: z.string() }).optional(),
});
const batchSchema = z.array(envelopeSchema);

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const padded = (address: string) => address.toLowerCase().slice(2).padStart(64, '0');

export function createErc20BalancesAdapter(): SourceAdapter<Erc20BalancesInput, Erc20Balance[]> {
  return {
    name: 'erc20-balances',

    canHandle(input) {
      return (
        /^https?:\/\//.test(input.rpcUrl) &&
        ADDRESS.test(input.token) &&
        input.holders.length > 0 &&
        input.holders.length <= ERC20_BALANCES_BATCH &&
        input.holders.every((address) => ADDRESS.test(address)) &&
        Number.isInteger(input.decimals) &&
        input.decimals >= 0 &&
        input.decimals <= 36
      );
    },

    fetch(input, ctx: SourceContext): Promise<SourceResult<Erc20Balance[]>> {
      const token = input.token.toLowerCase();
      const holders = input.holders.map((address) => address.toLowerCase());
      const body = JSON.stringify(
        holders.map((holder, index) => ({
          jsonrpc: '2.0',
          id: index + 1,
          method: 'eth_call',
          params: [{ to: token, data: `${BALANCE_OF}${padded(holder)}` }, 'latest'],
        })),
      );

      return performSourceFetch(
        ctx,
        { url: input.rpcUrl, method: 'POST', body, headers: { 'content-type': 'application/json' }, conditional: false },
        {
          schema: batchSchema,
          parse: (raw) => JSON.parse(raw) as unknown,
          cacheTtlSeconds: CACHE_TTL_SECONDS,
          normalize: (rows): Erc20Balance[] => {
            const out: Erc20Balance[] = [];
            holders.forEach((address, index) => {
              const row = rows.find((entry) => Number(entry.id) === index + 1);
              if (!row || row.error || row.result === undefined) return;
              const hex = row.result.startsWith('0x') ? row.result.slice(2) : row.result;
              // An empty or malformed answer is unknown, not a zero balance.
              if (hex.length === 0 || !/^[0-9a-fA-F]+$/.test(hex)) return;
              const amount = BigInt(`0x${hex}`) === 0n ? 0 : wholeTokens(row.result, input.decimals);
              if (amount === undefined) return;
              out.push({ address, amount });
            });
            return out;
          },
        },
      );
    },
  };
}
