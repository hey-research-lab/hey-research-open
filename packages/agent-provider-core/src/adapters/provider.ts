import type { AgentCapabilityRequest, ParsedAgentRequest } from '../request';
import type { AgentIntelligenceResponse, AgentResponseStatus } from '../schema';
import { quoteForTransport, type AgentText } from '../text';

/**
 * The provider boundary (2026-09-30, readiness §6).
 *
 *   canonical HEY reads (snapshot, explain, ledger, coverage, peers, contracts)
 *        ↓  pure composers (`../compose`)
 *   AgentIntelligenceResponse v1
 *        ↓  thin adapters (this folder)
 *   REST · MCP · A2A · a future platform adapter
 *
 * An adapter moves a request in and an answer out. It never reads HEY's
 * database, never computes a research value, and never receives or stores a
 * platform user's account, portfolio, positions, orders or prompts: the only
 * input HEY needs is the research query (a project, a contract, a window).
 * When a platform publishes its provider contract, supporting it means
 * writing one of these — transport, authentication and billing — and no
 * change to the research logic.
 */
export interface AgentProviderAdapter<PlatformRequest, PlatformResponse> {
  /** A stable id for the adapter. */
  readonly id: string;
  /** `live` only for an adapter serving a published interface. */
  readonly status: 'live' | 'pending_official_specification';
  /** The platform's request as a capability request. Nothing else from the request is kept. */
  toCapabilityRequest(request: PlatformRequest): ParsedAgentRequest;
  /** HEY's answer in the platform's shape. It must keep the answer, each claim's FACT/DERIVED/UNKNOWN, the unknowns, freshness, evidence ids and the boundaries. */
  fromResponse(response: AgentIntelligenceResponse): PlatformResponse;
}

/** The fields no adapter may drop: what makes a HEY answer HEY's. */
export const ADAPTER_REQUIRED_FIELDS = ['answer', 'answerStatus', 'claims', 'unknowns', 'freshness', 'evidence', 'boundaries', 'asOf', 'schemaVersion'] as const;

/* ------------------------------------------------------------------ REST */

/**
 * The HTTP status each answer status carries on REST (2026-11-09, made exhaustive): one table keyed by the
 * canonical union (`AGENT_RESPONSE_STATUSES`), so a new status fails the build until each door says how it
 * ends. The body is the same envelope in every case.
 * - `ambiguous` (2026-11-08): several projects match a name or ticker; an answer listing them, never an error
 *   the client must parse a 4xx for.
 * - `unavailable` is 404 like `not_found` (unchanged, machine rule 10): a client that must tell "HEY could not
 *   read it" from "no such project" reads the body's `status`, never the HTTP code.
 */
export const REST_HTTP_STATUS: Readonly<Record<AgentResponseStatus, 200 | 308 | 400 | 404>> = {
  ok: 200,
  ambiguous: 200,
  moved: 308,
  invalid_request: 400,
  not_found: 404,
  unavailable: 404,
};

/** The HTTP status a REST answer carries: the body is the same envelope in every case. */
export function restStatusOf(response: Pick<AgentIntelligenceResponse, 'status'>): number {
  return REST_HTTP_STATUS[response.status];
}

/**
 * Whether an MCP tool result carrying this answer is `isError` (2026-11-09, made exhaustive): only a malformed
 * request is the caller's to fix (2026-09-30, adversarial review). `ambiguous`, `not_found`, `moved` and
 * `unavailable` are answers: they say what HEY holds, and an ambiguous name lists its candidates. The MCP
 * handshake's sentence is written from this table (`mcp-core`), so the instruction and the behaviour agree.
 */
export const MCP_IS_ERROR: Readonly<Record<AgentResponseStatus, boolean>> = {
  ok: false,
  ambiguous: false,
  not_found: false,
  moved: false,
  invalid_request: true,
  unavailable: false,
};

/** Whether an MCP tool result carrying this answer is `isError`. */
export function mcpIsErrorOf(response: Pick<AgentIntelligenceResponse, 'status'>): boolean {
  return MCP_IS_ERROR[response.status];
}

/* ------------------------------------------------------------------- A2A */

/**
 * The A2A message's `metadata.status` for each answer status (2026-11-09, made exhaustive; values unchanged,
 * a partner field, machine rule 10): the skill vocabulary `ok | not_found | unavailable`, so `ambiguous`,
 * `moved` and `invalid_request` fold into `not_found` there. The canonical status always rides beside it as
 * `metadata.contractStatus`; an agent that must tell a malformed request or an ambiguous name from "no such
 * project" reads that.
 */
export const A2A_METADATA_STATUS: Readonly<Record<AgentResponseStatus, 'ok' | 'not_found' | 'unavailable'>> = {
  ok: 'ok',
  ambiguous: 'not_found',
  not_found: 'not_found',
  moved: 'not_found',
  invalid_request: 'not_found',
  unavailable: 'unavailable',
};

/** The A2A skill a capability arrives through, when a message asks for this contract. */
export const A2A_CONTRACT_OPTION = 'agent-intelligence-v1' as const;

export type A2aAgentParts = {
  parts: [
    { text: string; mediaType: 'text/plain'; metadata: { contentOrigin: AgentText['contentOrigin'] } },
    { data: AgentIntelligenceResponse; mediaType: 'application/json'; metadata: { contentOrigin: 'agent_contract'; schema: AgentIntelligenceResponse['schema'] } },
  ];
  metadata: {
    contract: typeof A2A_CONTRACT_OPTION;
    capability: AgentCapabilityRequest['capability'];
    status: AgentIntelligenceResponse['status'];
    canonicalUrl: string;
    evidenceIds: string[];
    notAdvice: true;
    /** Round 4 (additive): the answer's disclosures, when it has any. */
    disclosures?: { code: string; statement: string }[];
  };
};

/**
 * An A2A message's parts: the answer sentence as text — HEY's words, a
 * source's words quoted and labelled — and the whole answer as data. The
 * citation line (AG-02) is the text part's last line.
 */
export function toA2aParts(response: AgentIntelligenceResponse): A2aAgentParts {
  // Each with its status and page (2026-10-17, AG-3): enough to choose without a second call.
  const candidates = response.error?.candidates?.length
    ? ` Candidates: ${response.error.candidates.map((candidate) => `${candidate.slug}${candidate.activityStatus ? ` (${candidate.activityStatus})` : ''} ${candidate.url}`).join(', ')}.`
    : '';
  return {
    parts: [
      {
        // HEY's own token (round 4): the disclosure travels with the answer sentence.
        text: `${quoteForTransport(response.answer)} (${response.answerStatus}; as of ${response.asOf}; not investment advice.)${(response.disclosures ?? []).map((disclosure) => ` Disclosure: ${quoteForTransport(disclosure.statement)}.`).join('')}${candidates}${response.citation ? `\n${response.citation.text}` : ''}`,
        mediaType: 'text/plain',
        metadata: { contentOrigin: response.answer.contentOrigin },
      },
      { data: response, mediaType: 'application/json', metadata: { contentOrigin: 'agent_contract', schema: response.schema } },
    ],
    metadata: {
      contract: A2A_CONTRACT_OPTION,
      capability: response.capability,
      status: response.status,
      canonicalUrl: response.links.self,
      evidenceIds: response.evidence.map((ref) => ref.id),
      notAdvice: true,
      ...(response.disclosures ? { disclosures: response.disclosures.map((disclosure) => ({ code: disclosure.code, statement: disclosure.statement.text })) } : {}),
    },
  };
}
