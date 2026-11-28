import type { HeyTerminalCatalysts, HeyTerminalContractControl, HeyTerminalDeepResearch, HeyTerminalSavedViews, HeyTerminalScreener } from '@hey-research-lab/sdk';

import { quotedName, shownOf, type RenderedParts } from './render';

/**
 * The holder tools' text (2026-11-27, Terminal holder value wave 3 lane K): the `/api/terminal/*` answers as a model
 * reads them. Each restates its answer and says nothing it does not hold (machine rule 7): every line carries its
 * receipt or its reason, and every listing ends with how many it showed of how many and how to read on. No valuation,
 * price, volume or account is in any of them, because the answers carry none.
 */

const day = (iso: string | null): string => (iso ? iso.slice(0, 10) : 'not read');
const receipts = (ids: readonly string[]): string => (ids.length > 0 ? ` [${ids.join(', ')}]` : '');

export function renderDeepResearch(answer: HeyTerminalDeepResearch): RenderedParts {
  if (answer.status === 'declined') {
    const candidates = answer.candidates.length > 0 ? `\nCandidates (send one slug back in the question): ${answer.candidates.map((c) => `${c.slug} (${quotedName(c.name)})`).join(', ')}.` : '';
    return { body: `Deep research declined: ${answer.reason}${candidates}`, footer: '' };
  }
  const scope = answer.scope.kind === 'project' ? `the project ${quotedName(answer.scope.project.name)} (${answer.scope.project.slug})` : answer.scope.kind === 'following' ? 'the projects this account follows' : 'Robinhood Chain';
  const steps = answer.steps.map((step) => {
    const lines = step.lines.map((line) => `- ${line.tag}: ${line.text}${receipts(line.evidence.map((evidence) => evidence.id))}`);
    const held = step.held > 0 ? `\n  ${step.held} sentence${step.held === 1 ? '' : 's'} with no receipt held, not printed.` : '';
    const shown = step.shown.total > step.shown.shown ? `\n  ${shownOf(step.shown.shown, step.shown.total, 'The rest are on the Terminal’s Ask HEY answer for this step.')}` : '';
    const notes = step.notes.length > 0 ? `\n  ${step.notes.join(' ')}` : '';
    return `## ${step.title}${step.lead ? `\n${step.lead}` : ''}\n${lines.length > 0 ? lines.join('\n') : step.held > 0 ? 'Every sentence here lacked a receipt, so none is printed.' : 'HEY holds no record for this step.'}${held}${shown}${notes}`;
  });
  const allowance = `${answer.allowance.remaining} of ${answer.allowance.dailyQuota} deep questions left today, shared with ${answer.allowance.sharedWith}; they return at ${answer.allowance.resetsAt.slice(11, 16)} UTC.${answer.allowance.repeated ? ' This question was asked today already and spent nothing.' : ''}`;
  return {
    body: `Deep research on ${scope}: ${answer.steps.length} steps, citing ${answer.receipts.length} record${answer.receipts.length === 1 ? '' : 's'}. Each line is tagged FACT, DERIVED or UNKNOWN; the ids in [brackets] are its receipts (open one with get_evidence).\n\n${steps.join('\n\n')}`,
    footer: `\n${answer.method}\n${allowance}`,
  };
}

export function renderSavedViews(page: HeyTerminalSavedViews): RenderedParts {
  const lines = page.views.map((view) => {
    const news = view.news.state === 'COUNTED' ? `${view.news.count} new since ${day(view.news.since)}` : view.news.reason === 'never_opened' ? 'new matches not tracked (never opened)' : 'new matches not tracked (too many matches)';
    return `- ${quotedName(view.name)} — id ${view.id}; screen ${view.search || '(the default screen)'}; ${news}. Run it with terminal_screener view=${view.id}.`;
  });
  return {
    body: lines.length > 0 ? `Saved screener views:\n${lines.join('\n')}` : 'This account holds no saved screener view. Views are saved on the Terminal’s screener page.',
    footer: `\n${shownOf(page.shown, page.total, undefined)} ${page.note}`,
  };
}

export function renderScreener(page: HeyTerminalScreener): RenderedParts {
  const lines = page.rows.map((row) => {
    const figures = [
      `status ${row.activityStatus}`,
      `last ship ${day(row.lastMeaningfulShipAt)}`,
      row.ships30d === null ? 'counted ships 30 d not measured' : `counted ships 30 d ${row.ships30d}`,
      row.buildMomentum === null ? `Build Momentum not measured (${row.buildMomentumWithheld})` : `Build Momentum ${row.buildMomentum.toFixed(1)}`,
      row.discoveryGap === null ? `Discovery Gap not measured (${row.discoveryGapWithheld})` : `Discovery Gap ${row.discoveryGap.toFixed(1)}`,
      row.verifiedBuilder ? 'Verified Builder' : null,
      row.chainEvidence === null ? 'chain evidence not read' : row.chainEvidence ? 'Robinhood Chain evidence held' : 'no Robinhood Chain evidence found',
      row.development ? `velocity ${row.development.velocityState}, cadence ${row.development.cadenceState}` : null,
    ].filter((part): part is string => part !== null);
    return `- ${quotedName(row.name)} (${row.slug}): ${figures.join('; ')}.`;
  });
  const more = page.nextOffset !== null ? `Call terminal_screener again with the same arguments and offset=${page.nextOffset}.` : undefined;
  return {
    body: `${page.savedView ? `Saved view ${quotedName(page.savedView.name)}. ` : ''}Builder screener, ordered by ${page.order.label.toLowerCase()} (${page.order.hint}) Market fields: ${page.marketFields}\nScreen as HEY read it: ${JSON.stringify(page.query)}.\n${lines.length > 0 ? lines.join('\n') : 'No project matches this screen.'}`,
    footer: `\n${shownOf(page.offset + page.shown, page.total, more)}${page.offset > 0 ? ` (rows ${page.offset + 1}–${page.offset + page.shown} on this page)` : ''}`,
  };
}

export function renderContractControl(control: HeyTerminalContractControl): RenderedParts {
  const holder = (label: string, value: HeyTerminalContractControl['contracts'][number]['owner']) => (value ? `${label} ${value.words} since ${day(value.since)} [${value.evidenceId}]` : null);
  const contracts = control.contracts.map((contract) => {
    if (contract.state === 'not_read') return `- ${contract.address} (${contract.role}): not read yet by the control watch.`;
    const parts = [
      `proxy ${contract.proxyKind ?? 'not read'}`,
      holder('owner', contract.owner) ?? 'no ownership log read',
      holder('proposed owner', contract.ownerProposed),
      holder('proxy admin', contract.admin),
      `read through ${day(contract.readThrough)}`,
    ].filter((part): part is string => part !== null);
    return `- ${contract.address} (${contract.role}): ${parts.join('; ')}.`;
  });
  const pending = control.pending.map((op) => `- ${op.label}: ${op.summary}; scheduled ${day(op.scheduledAt)}, may run ${op.executableAt ? day(op.executableAt) : 'at a time the log did not state'}${op.executable ? ' (its time has come; no execution or cancellation read)' : ''} [${op.id}]`);
  const recent = control.recent.map((entry) => `- ${day(entry.occurredAt ?? entry.detectedAt)} ${entry.label}: ${entry.summary} [${entry.id}]`);
  return {
    body: `Contract control for ${control.slug}.\n${contracts.length > 0 ? contracts.join('\n') : 'HEY holds no contract of this project for the control watch.'}${control.notRead > 0 ? `\n${control.notRead} contract${control.notRead === 1 ? '' : 's'} not read yet.` : ''}\n\nQueued timelock operations:\n${pending.length > 0 ? pending.join('\n') : 'None queued that HEY read.'}\n\nRecent control changes and upgrades, newest first:\n${recent.length > 0 ? recent.join('\n') : 'None HEY read.'}\n${control.note}`,
    footer: `\nRecent changes: ${control.recentShown} shown, at most ${control.recentLimit}.${control.recentMore ? ` ${control.recentMore}` : ' That is every one HEY holds.'}`,
  };
}

export function renderCatalysts(calendar: HeyTerminalCatalysts): RenderedParts {
  const items = calendar.items.map(
    (item) =>
      `- ${item.at.slice(0, 16).replace('T', ' ')} UTC — ${item.kindWords} ${quotedName(item.project.name)} (${item.project.slug}): ${item.title}. ${item.basisWords}; ${item.source}. Receipt: ${item.receipt.id ?? item.receipt.url}`,
  );
  const scope = calendar.view === 'chain' ? 'Robinhood Chain' : calendar.view === 'following' ? `the ${calendar.projectCount ?? 0} projects this account follows` : `the board ${calendar.board ? quotedName(calendar.board.name) : ''} (${calendar.projectCount ?? 0} projects)`;
  return {
    body: `HoodLock unlocks for ${scope}, the next ${calendar.windowDays} days. ${calendar.order}\n${items.length > 0 ? items.join('\n') : 'No unlock dated in this window.'}\n\n${calendar.stockTokens.note}\nNot read: ${calendar.notRead.map((entry) => entry.line).join(' ')}`,
    footer: `\nUnlocks: ${shownOf(calendar.unlocksShown, calendar.unlocksTotal, calendar.unlocksMore ?? undefined)}`,
  };
}
