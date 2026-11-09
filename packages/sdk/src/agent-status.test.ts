import { describe, expect, it } from 'vitest';

import { HEY_AGENT_STATUSES, isAmbiguous, isNotFound, isOk } from './agent-status';
import type { HeyAgentResponse } from './types/agent';

const answer = (status: HeyAgentResponse['status'], extra: Partial<HeyAgentResponse> = {}): HeyAgentResponse =>
  ({
    status,
    capability: 'research_project',
    data: null,
    citation: status === 'ok' ? { kind: 'hey_agent_answer', capability: 'research_project', schemaVersion: '1', url: 'https://hey.test/project/a', asOf: '2026-11-09T00:00:00.000Z', text: 'Source: HEY' } : null,
    ...extra,
  }) as HeyAgentResponse;

describe('agent status guards (2026-11-09)', () => {
  it('each status answers exactly one guard, or none for moved, invalid_request and unavailable', () => {
    for (const status of HEY_AGENT_STATUSES) {
      const response = answer(status);
      expect([isOk(response), isAmbiguous(response), isNotFound(response)]).toEqual([status === 'ok', status === 'ambiguous', status === 'not_found']);
    }
  });

  it('narrows: an ok answer carries its citation, an ambiguous one its candidates', () => {
    const ok = answer('ok');
    if (!isOk(ok)) throw new Error('expected ok');
    expect(ok.citation.url).toBe('https://hey.test/project/a');
    const ambiguous = answer('ambiguous', { candidates: [{ slug: 'a', url: 'https://hey.test/project/a' } as never] });
    if (!isAmbiguous(ambiguous)) throw new Error('expected ambiguous');
    expect(ambiguous.candidates.map((candidate) => candidate.slug)).toEqual(['a']);
  });
});
