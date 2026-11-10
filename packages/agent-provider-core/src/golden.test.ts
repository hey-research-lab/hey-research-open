import { describe, expect, it } from 'vitest';

import { A2A_METADATA_STATUS, MCP_IS_ERROR, REST_HTTP_STATUS, restStatusOf, toA2aParts } from './adapters/provider';
import { renderAgentResponseText } from './adapters/text';
import { AGENT_CAPABILITIES, AGENT_CAPABILITY_INFO } from './capabilities';
import { ambiguousRefusal, notPublishedRefusal, type AgentComposeContext } from './compose/common';
import { AGENT_RESPONSE_STATUSES } from './schema';

/**
 * Golden baseline of the agent contract a partner parses (multichain WP1.0, 2026-11-11).
 *
 * Machine rule 10: partner fields never change meaning. Since 2026-11-08 a name several projects share answers
 * `status: ambiguous` at HTTP 200 (an answer, never an error), and each door has its status table. These goldens hold
 * the tables, every capability's declared parameters, and the ambiguous and not-published envelopes byte for byte, as
 * JSON and in each transport's text, composed for Robinhood Chain (4663) at a fixed instant.
 *
 * The same answers from the real route on a seeded database are held in
 * `apps/web/src/lib/golden/surfaces.integration.test.ts`. A phase 1 package changes neither; a deliberate contract
 * change updates the golden on purpose (`pnpm vitest run --project unit -u packages/agent-provider-core/src/golden.test.ts`).
 */
// `@hey/config/golden`'s serializer, inlined: this package feeds the public `hey-agent-contract` and takes no private dependency.
const goldenJson = (value: unknown): string => `${JSON.stringify(value, (_key, child: unknown) => (child === undefined ? '[undefined]' : child), 2)}\n`;

const BASE = 'https://heyresearch.xyz';
const ctx: AgentComposeContext = {
  baseUrl: BASE,
  chainId: 4663,
  chainName: 'Robinhood Chain',
  now: new Date('2026-11-11T09:00:00.000Z'),
  disclaimer: 'Research only.',
  selfUrl: `${BASE}/api/agent/research_project?q=%24CHIT`,
  query: { chainId: 4663, q: '$CHIT' },
};

describe('golden: the agent contract', () => {
  it('every door’s status table and every capability’s declaration', async () => {
    expect(REST_HTTP_STATUS.ambiguous).toBe(200);
    await expect(
      goldenJson({ AGENT_RESPONSE_STATUSES, REST_HTTP_STATUS, MCP_IS_ERROR, A2A_METADATA_STATUS, AGENT_CAPABILITIES, AGENT_CAPABILITY_INFO }),
    ).toMatchFileSnapshot('./__goldens__/agent-contract-tables.json');
  });

  it('an ambiguous name: status ambiguous at HTTP 200, its candidates, and its text on every door', async () => {
    const ambiguous = ambiguousRefusal(ctx, 'research_project', [
      { slug: 'chit', name: 'Chit', url: `${BASE}/project/chit`, token: { chainId: 4663, address: `0x${'d'.repeat(40)}` }, symbol: 'CHIT', activityStatus: 'SHIPPING' },
      { slug: 'chit-chat', name: 'Chit Chat', url: `${BASE}/project/chit-chat` },
    ]);
    expect(restStatusOf(ambiguous)).toBe(200);
    await expect(
      goldenJson({ httpStatus: restStatusOf(ambiguous), body: ambiguous, text: renderAgentResponseText(ambiguous, { detail: 'summary' }), a2a: toA2aParts(ambiguous) }),
    ).toMatchFileSnapshot('./__goldens__/agent-ambiguous.json');
  });

  it('a contract HEY has not published: not_found, about HEY’s index and never about the token', async () => {
    const missing = notPublishedRefusal({ ...ctx, query: { chainId: 4663, address: `0x${'a'.repeat(40)}` } }, 'builder_status', 'address');
    await expect(
      goldenJson({ httpStatus: restStatusOf(missing), body: missing, text: renderAgentResponseText(missing, { detail: 'summary' }) }),
    ).toMatchFileSnapshot('./__goldens__/agent-not-published.json');
  });
});
