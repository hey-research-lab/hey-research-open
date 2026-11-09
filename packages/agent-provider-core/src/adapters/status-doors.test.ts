import { describe, expect, it } from 'vitest';

import { AGENT_RESPONSE_STATUSES } from '../schema';
import { A2A_METADATA_STATUS, MCP_IS_ERROR, mcpIsErrorOf, REST_HTTP_STATUS, restStatusOf } from './provider';

/**
 * Each door's status table (2026-11-09): one entry per canonical status, so REST, MCP and A2A say how every
 * answer ended. A table is keyed by `AgentResponseStatus`, so the build fails on a missing key; this pins the
 * values a partner already reads (machine rule 10).
 */
describe('the agent status at every door', () => {
  it('every door has exactly the canonical statuses', () => {
    for (const table of [REST_HTTP_STATUS, MCP_IS_ERROR, A2A_METADATA_STATUS]) {
      expect(Object.keys(table).sort()).toEqual([...AGENT_RESPONSE_STATUSES].sort());
    }
  });

  it('REST keeps its HTTP codes: ambiguous is 200, unavailable stays 404', () => {
    expect(REST_HTTP_STATUS).toEqual({ ok: 200, ambiguous: 200, moved: 308, invalid_request: 400, not_found: 404, unavailable: 404 });
    for (const status of AGENT_RESPONSE_STATUSES) expect(restStatusOf({ status })).toBe(REST_HTTP_STATUS[status]);
  });

  it('MCP marks only a malformed request isError; an ambiguous name is an answer', () => {
    for (const status of AGENT_RESPONSE_STATUSES) expect(mcpIsErrorOf({ status })).toBe(status === 'invalid_request');
  });

  it('A2A metadata.status keeps the skill vocabulary (values unchanged)', () => {
    expect(A2A_METADATA_STATUS).toEqual({ ok: 'ok', ambiguous: 'not_found', not_found: 'not_found', moved: 'not_found', invalid_request: 'not_found', unavailable: 'unavailable' });
  });
});
