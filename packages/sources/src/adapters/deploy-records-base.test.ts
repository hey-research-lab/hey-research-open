import { describe, expect, it } from 'vitest';

import { hasData } from '../adapter';
import { readFixture, stubFetch, testContext } from '../testing';
import { parseDeployRecord, parseDeploymentsJson, parseFoundryBroadcast, parseHardhatDeployment, planDeployRecordReads } from './deploy-records';
import { createGithubFileAdapter, createGithubHeadCommitAdapter, createGithubTreeAdapter } from './github-contents';

/**
 * A Base page's own repository's deployment records (2026-11-27, founder "ok buat 1, 2 dan 4"): which paths the Base
 * reader plans, what each record names with its provenance (`provenance: true`), and the commit-pinned reads. Saved
 * fixtures only; no network. The home reader's answers are unchanged (`deploy-records.test.ts`).
 */
const BASE = 8453;
const NETWORKS = ['base', 'base-mainnet', 'base_mainnet'];
const SHA = '4f2c9a1e7b3d5f8a0c6e2b4d9f1a3c5e7b9d0f2a';

describe('the commit a read is pinned to', () => {
  it('reads the default branch’s commit as a bare id and pins the tree and the files to it', async () => {
    const head = stubFetch({ status: 200, body: readFixture('github-head-commit-sha.txt'), headers: { 'content-type': 'application/vnd.github.sha' } });
    const commit = await createGithubHeadCommitAdapter().fetch({ owner: 'harbor-labs', repo: 'harbor-contracts', token: 't' }, testContext({ fetchImpl: head.fetchImpl }));
    expect(hasData(commit) && commit.data.sha).toBe(SHA);
    expect(head.requests[0]?.url).toBe('https://api.github.com/repos/harbor-labs/harbor-contracts/commits/HEAD');
    expect((head.requests[0]?.init?.headers as Record<string, string>).accept).toBe('application/vnd.github.sha');

    const tree = stubFetch({ status: 200, body: readFixture('github-tree-base-deploy-records.json'), headers: { 'content-type': 'application/json' } });
    await createGithubTreeAdapter().fetch({ owner: 'harbor-labs', repo: 'harbor-contracts', ref: SHA }, testContext({ fetchImpl: tree.fetchImpl }));
    expect(tree.requests[0]?.url).toBe(`https://api.github.com/repos/harbor-labs/harbor-contracts/git/trees/${SHA}?recursive=1`);

    const file = stubFetch({ status: 200, body: readFixture('foundry-broadcast-base.json') });
    await createGithubFileAdapter().fetch({ owner: 'harbor-labs', repo: 'harbor-contracts', path: 'broadcast/DeployVault.s.sol/8453/run-latest.json', ref: SHA }, testContext({ fetchImpl: file.fetchImpl }));
    expect(file.requests[0]?.url).toBe(`https://api.github.com/repos/harbor-labs/harbor-contracts/contents/broadcast/DeployVault.s.sol/8453/run-latest.json?ref=${SHA}`);
  });

  it('refuses an answer that is not a commit id, and a ref that is not one', async () => {
    const html = stubFetch({ status: 200, body: '<html>main</html>' });
    const answer = await createGithubHeadCommitAdapter().fetch({ owner: 'o', repo: 'r' }, testContext({ fetchImpl: html.fetchImpl }));
    expect(hasData(answer)).toBe(false);
    expect(createGithubTreeAdapter().canHandle({ owner: 'o', repo: 'r', ref: 'main' })).toBe(false);
    expect(createGithubFileAdapter().canHandle({ owner: 'o', repo: 'r', path: 'a.json', ref: '../x' })).toBe(false);
    const refused = stubFetch({ status: 200, body: '{}' });
    await createGithubTreeAdapter().fetch({ owner: 'o', repo: 'r', ref: 'main?x=1' }, testContext({ fetchImpl: refused.fetchImpl }));
    expect(refused.requests).toHaveLength(0);
  });
});

describe('which files a Base repository’s tree offers', () => {
  const tree = (JSON.parse(readFixture('github-tree-base-deploy-records.json')) as { tree: { path: string; type: string }[] }).tree
    .filter((entry) => entry.type === 'blob')
    .map((entry) => entry.path);

  it('plans the chain-8453 broadcast, the base-named hardhat-deploy folders and a root addresses file — nothing else', () => {
    const plan = planDeployRecordReads(tree, { chainId: BASE, networkNames: NETWORKS, addressFiles: true });
    expect(plan.files).toEqual([
      { path: 'broadcast/DeployVault.s.sol/8453/run-latest.json', kind: 'FOUNDRY_BROADCAST' },
      { path: 'addresses.json', kind: 'DEPLOYMENTS_JSON' },
    ]);
    // A vendored broadcast, a dry run, Base Sepolia (84532), another chain, a test fixture: never planned.
    const byDir = [...plan.hardhatNetworks].sort((a, b) => a.dir.localeCompare(b.dir));
    expect(byDir.map((network) => [network.dir, network.chainIdPath, network.files])).toEqual([
      ['deployments/base', 'deployments/base/.chainId', ['deployments/base/Staking.json']],
      ['deployments/base_mainnet', '', ['deployments/base_mainnet/Rewards.json']],
    ]);
  });

  it('keeps the home plan as it was: a network folder needs its .chainId, and no addresses file', () => {
    const home = planDeployRecordReads(tree, { chainId: BASE });
    expect(home.files.map((file) => file.path)).toEqual(['broadcast/DeployVault.s.sol/8453/run-latest.json']);
    expect(home.hardhatNetworks.map((network) => network.dir).sort()).toEqual(['deployments/arbitrum', 'deployments/base']);
  });
});

describe('what a Base record names, with its provenance', () => {
  it('Foundry: each created contract with its name and sender; a factory’s child names the factory; a call or a mock is none', () => {
    const contracts = parseFoundryBroadcast(readFixture('foundry-broadcast-base.json'), BASE, { provenance: true });
    expect(contracts).toEqual([
      {
        address: '0x7a11c0ffee00000000000000000000000000ba5e',
        created: true,
        contractName: 'HarborVault',
        names: ['HarborVault'],
        txHash: '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f801',
        deployers: ['0x5151515151515151515151515151515151515151'],
      },
      {
        address: '0xb0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0',
        created: true,
        contractName: 'ClankerToken',
        names: ['ClankerToken'],
        txHash: '0x3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8010203',
        deployers: ['0xe85a59c628f7d27878aceb4bf3b35733630083a9', '0x5151515151515151515151515151515151515151'],
      },
    ]);
    // The broadcast's own chain field decides: the same file read for another chain says nothing.
    expect(parseFoundryBroadcast(readFixture('foundry-broadcast-base.json'), 4663, { provenance: true })).toBeNull();
    // Without `provenance` the answer is the home reader's shape.
    expect(parseFoundryBroadcast(readFixture('foundry-broadcast-base.json'), BASE)?.[0]).toEqual({
      address: '0x7a11c0ffee00000000000000000000000000ba5e',
      created: true,
      contractName: 'HarborVault',
      txHash: '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f801',
    });
  });

  it('hardhat-deploy: the file’s name and the record’s own contractName, and the receipt’s sender', () => {
    const staking = parseHardhatDeployment(readFixture('hardhat-deploy-base-staking.json'), 'deployments/base/Staking.json', { provenance: true });
    expect(staking).toEqual({
      address: '0x5747a4b1a6b0000000000000000000000000c0de',
      created: true,
      txHash: '0x5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80102030405',
      contractName: 'Staking',
      names: ['Staking'],
      deployers: ['0x5151515151515151515151515151515151515151'],
    });
    const named = parseHardhatDeployment(JSON.stringify({ ...JSON.parse(readFixture('hardhat-deploy-base-staking.json')), contractName: 'StakingV2' }), 'deployments/base/Staking.json', { provenance: true });
    expect(named?.names).toEqual(['Staking', 'StakingV2']);
  });

  it('a hand-kept file: only the entries under a Base network key, never a base asset or Base Sepolia', () => {
    const text = readFixture('deployments-base-addresses.json');
    const named = parseDeploymentsJson(text, BASE, 'addresses.json', { owner: 'harbor-labs', name: 'harbor-contracts' }, { networkNames: NETWORKS, provenance: true });
    expect(named?.map((contract) => [contract.address, contract.names, contract.created])).toEqual([
      // HarborRouter is a router by its key (a reference, never a deployment): dropped.
      ['0x7ea5000000000000000000000000000000000001', ['Treasury'], false],
      ['0xfeec011ec70000000000000000000000000000fe', ['FeeCollector'], true],
    ]);
    // Without the Base network names the same file names no chain, so nothing.
    expect(parseDeploymentsJson(text, BASE, 'addresses.json')).toEqual([]);
    // A file named for the network: every entry in it is the chain's.
    expect(parseDeployRecord('DEPLOYMENTS_JSON', 'deployments/base.json', JSON.stringify({ Vault: '0x7a11c0ffee00000000000000000000000000ba5e' }), BASE, undefined, { networkNames: NETWORKS, provenance: true })).toEqual([
      { address: '0x7a11c0ffee00000000000000000000000000ba5e', created: false, contractName: 'Vault', names: ['Vault'] },
    ]);
  });
});
