/**
 * A NEAR mainnet account id, by NEAR's own account-id rules (NEP-0006, nearcore's `AccountId` validation): 2 to 64
 * characters, parts separated by `.`, each part lower-case letters and digits with single `-` or `_` between them —
 * never leading, trailing or doubled — so named accounts (`proof-of-ship.hey.near`), top-level accounts and implicit
 * accounts (64 hex characters, or `0x` and 40) all pass, and capitals, spaces or an empty part never do.
 *
 * Mainnet only: a `testnet` account (the testnet registrar's namespace, `*.testnet`) is refused, because the one NEAR
 * domain Proof of Ship signs is mainnet's (chain id 397; 2026-11-03, NEAR HACKATHON). It lives here, below the
 * environment schema that reads the configured NEAR escrows and the domain module that reads
 * `escrow=near:<account id>`, so both apply one rule. It is a rule about account ids only and decides nothing.
 */
export const NEAR_ACCOUNT_ID_PATTERN = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export const NEAR_ACCOUNT_ID_MIN_LENGTH = 2;
export const NEAR_ACCOUNT_ID_MAX_LENGTH = 64;

export function isNearMainnetAccountId(value: string): boolean {
  // The length first: the pattern then only ever runs on at most 64 characters.
  if (value.length < NEAR_ACCOUNT_ID_MIN_LENGTH || value.length > NEAR_ACCOUNT_ID_MAX_LENGTH) return false;
  if (!NEAR_ACCOUNT_ID_PATTERN.test(value)) return false;
  return value !== 'testnet' && !value.endsWith('.testnet');
}
