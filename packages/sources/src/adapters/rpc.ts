import { z } from 'zod';

import { type SourceAdapter, type SourceContext, type SourceResult } from '../adapter';
import { performSourceFetch } from '../http/perform';

/**
 * Lightweight JSON-RPC reads (PRD V4 sections 20.1, 22.1).
 *
 * Used only to confirm evidence: does a contract exist, what block are we at.
 * HEY does not run a node and does not index chain history.
 */
export type RpcInput = {
  rpcUrl: string;
  address: string;
};

const rpcEnvelopeSchema = z.object({
  jsonrpc: z.literal('2.0').optional(),
  id: z.union([z.number(), z.string()]).nullish(),
  result: z.string().optional(),
  error: z.object({ code: z.number().optional(), message: z.string() }).optional(),
});

export type ContractExistence = {
  address: string;
  /** Contract accounts return bytecode; externally-owned accounts return `0x`. */
  isContract: boolean;
  bytecodeSize: number;
  /**
   * The implementation an EIP-1167 minimal clone delegates to, read from the
   * clone's own bytecode (2026-09-30). The chain's code is the proof; absent
   * for any other contract.
   */
  minimalProxyTarget?: string;
  /**
   * The address runs Safe's proxy (2026-11-24, Base rehearsal 3): a multisig wallet, read from its own bytecode
   * ({@link isSafeProxyRuntime}). Present only when it matched; absent for any other contract.
   */
  safeProxy?: true;
};

/**
 * The EIP-1167 runtime: `363d3d373d3d3d363d73` + the 20-byte implementation +
 * `5af43d82803e903d91602b57fd5bf3`, exactly 45 bytes. Nothing else matches.
 */
const EIP1167_RUNTIME = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/;

export function minimalProxyTarget(code: string | undefined): string | undefined {
  const match = EIP1167_RUNTIME.exec((code ?? '').toLowerCase());
  return match ? `0x${match[1]}` : undefined;
}

/**
 * Safe's proxy runtime (2026-11-24, Base rehearsal 3): the masterCopy proxy every Safe wallet is — `GnosisSafeProxy`
 * 1.1.1 to 1.3.0 and `SafeProxy` 1.4.1 — whose code loads its singleton from storage slot 0 (`6000 54`, masked to 20
 * bytes) and answers `masterCopy()` (selector `0xa619486e`) itself before delegating. Only the opening up to the
 * selector is matched, so the compiler's metadata trailer (which differs by version) does not matter. Checked on
 * 2026-11-24 against the Base SafeProxy rehearsal 3 counted (`0x52d3…4877`, slot 0 holding SafeL2 1.4.1) and the
 * `proxyRuntimeCode()` of the 1.3.0 factories on Base (`0xa6B7…6AB2`, `0xC228…10BC`) and the 1.1.1 factory on Ethereum.
 */
const SAFE_PROXY_RUNTIME = /^0x608060405273f{40}600054167fa619486e0{56}/;

/** Whether an address's runtime code is a Safe proxy: a multisig wallet, never a project's product contract. */
export function isSafeProxyRuntime(code: string | undefined): boolean {
  return SAFE_PROXY_RUNTIME.test((code ?? '').toLowerCase());
}

const CACHE_TTL_SECONDS = 3600;

export function createRpcContractAdapter(): SourceAdapter<RpcInput, ContractExistence> {
  return {
    name: 'rpc-contract',

    canHandle(input) {
      return Boolean(input.rpcUrl) && /^0x[a-fA-F0-9]{40}$/.test(input.address);
    },

    fetch(input, ctx: SourceContext): Promise<SourceResult<ContractExistence>> {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getCode',
        params: [input.address, 'latest'],
      });

      return performSourceFetch(
        ctx,
        {
          url: input.rpcUrl,
          method: 'POST',
          body,
          headers: { 'content-type': 'application/json' },
          // POST bodies are not cacheable; conditional headers would be meaningless.
          conditional: false,
        },
        {
          schema: rpcEnvelopeSchema.superRefine((value, context) => {
            if (value.error) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `rpc error: ${value.error.message}`,
              });
            } else if (value.result === undefined) {
              context.addIssue({ code: z.ZodIssueCode.custom, message: 'missing rpc result' });
            }
          }),
          parse: (raw) => JSON.parse(raw) as unknown,
          cacheTtlSeconds: CACHE_TTL_SECONDS,
          normalize: (raw): ContractExistence => {
            const code = raw.result ?? '0x';
            const hex = code.startsWith('0x') ? code.slice(2) : code;
            const target = minimalProxyTarget(code);
            return {
              address: input.address,
              isContract: hex.length > 0,
              bytecodeSize: Math.floor(hex.length / 2),
              ...(target ? { minimalProxyTarget: target } : {}),
              ...(isSafeProxyRuntime(code) ? { safeProxy: true as const } : {}),
            };
          },
        },
      );
    },
  };
}
