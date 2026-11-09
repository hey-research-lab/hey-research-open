import { describe, expect, it } from 'vitest';

import { AGENT_RESPONSE_STATUSES } from '@hey/agent-provider-core';
import { HEY_AGENT_STATUSES } from '@hey-research-lab/sdk';

/** The SDK's agent statuses are the contract's (2026-11-09): a new status reaches the SDK's guards before it ships. */
describe('agent status parity', () => {
  it('the SDK lists every canonical status, in order', () => {
    expect([...HEY_AGENT_STATUSES]).toEqual([...AGENT_RESPONSE_STATUSES]);
  });
});
