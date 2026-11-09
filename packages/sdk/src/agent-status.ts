import type { HeyAgentCandidate, HeyAgentResponse } from './types/agent';

/**
 * How an agent answer ended (2026-11-09, additive): the API's `status`, narrowed. The field stays flat on the
 * response; these guards let a caller read `citation` or `candidates` only where the API carries them.
 *
 * - `ok`: an answer HEY stands behind, with its `citation`.
 * - `ambiguous`: several published projects match a `q`; `candidates` lists them and HEY picks none (HTTP 200).
 * - `not_found`: HEY holds no published project for the query — a statement about HEY's index.
 *
 * `moved`, `invalid_request` and `unavailable` are the other statuses; read `status` for them. On REST
 * `unavailable` and `not_found` share HTTP 404, so read the body's `status`, never the HTTP code.
 */
export type HeyAgentStatus = HeyAgentResponse['status'];

/** Every status an agent answer can carry, in the API's order. */
export const HEY_AGENT_STATUSES = ['ok', 'ambiguous', 'not_found', 'moved', 'invalid_request', 'unavailable'] as const satisfies readonly HeyAgentStatus[];

/** Fails the build when `HeyAgentResponse['status']` gains a status this list does not name. */
type MissingStatus = Exclude<HeyAgentStatus, (typeof HEY_AGENT_STATUSES)[number]>;
const everyStatusListed: [MissingStatus] extends [never] ? true : MissingStatus = true;
void everyStatusListed;

type Citation = NonNullable<HeyAgentResponse['citation']>;

/** An `ok` answer: its `citation` is present. */
export function isOk<R extends HeyAgentResponse>(response: R): response is R & { status: 'ok'; citation: Citation } {
  return response.status === 'ok';
}

/** An `ambiguous` answer: `candidates` lists the projects a `q` could mean; send one back as `project`. */
export function isAmbiguous<R extends HeyAgentResponse>(response: R): response is R & { status: 'ambiguous'; candidates: HeyAgentCandidate[]; citation: null } {
  return response.status === 'ambiguous';
}

/** A `not_found` answer: HEY holds no published project for the query. */
export function isNotFound<R extends HeyAgentResponse>(response: R): response is R & { status: 'not_found'; citation: null } {
  return response.status === 'not_found';
}
