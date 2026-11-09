import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProjectCard, type ProjectCardData } from './project-card';
import { ProjectList, ProjectListRow } from './project-list';

/**
 * The name disclaimer (founder ruling 2026-11-09, CLAUDE.md UI rule 16): the domain decides it
 * (`nameNeedsRobinhoodDisclaimer`) and hands the sentence in as `nameDisclaimer`; the card and the list row draw it,
 * small and muted, directly under the name, and draw nothing when it is absent.
 */
const DISCLAIMER = 'An independent project. Not affiliated with or endorsed by Robinhood.';

const project: ProjectCardData = {
  slug: 'robinhood-sentinel',
  name: 'Robinhood Sentinel',
  projectKind: 'UTILITY',
  activityStatus: 'SHIPPING',
  nameDisclaimer: DISCLAIMER,
};

const card = (data: ProjectCardData) => renderToStaticMarkup(createElement(ProjectCard, { project: data }));
const row = (data: ProjectCardData) =>
  renderToStaticMarkup(createElement(ProjectList, { caption: 'Projects', children: createElement(ProjectListRow, { project: data, now: new Date('2026-11-09T12:00:00Z') }) }));

describe('the Robinhood name disclaimer', () => {
  it('sits on the card directly under the name, muted', () => {
    const html = card(project);
    expect(html).toContain('data-testid="name-disclaimer"');
    expect(html).toContain(DISCLAIMER);
    // Right after the name's heading, before the identity line or anything else.
    const heading = html.indexOf('</h3>');
    expect(heading).toBeGreaterThan(-1);
    expect(html.indexOf(DISCLAIMER)).toBeGreaterThan(heading);
    expect(html.slice(heading, html.indexOf(DISCLAIMER))).toMatch(/^<\/h3><p class="[^"]*text-hey-muted[^"]*" data-testid="name-disclaimer">$/);
  });

  it('sits in the list row under the name, inside the project cell', () => {
    const html = row(project);
    expect(html).toContain('class="v2-row-disclaimer" data-testid="name-disclaimer"');
    const start = html.indexOf('class="v2-cell-project"');
    const cell = html.slice(start, html.indexOf('</th>', start));
    expect(cell.indexOf('data-testid="row-name"')).toBeGreaterThan(-1);
    expect(cell.indexOf('data-testid="row-name"')).toBeLessThan(cell.indexOf(DISCLAIMER));
  });

  it('is absent when the domain set none', () => {
    const { nameDisclaimer: _omit, ...plain } = project;
    expect(card(plain)).not.toContain('name-disclaimer');
    expect(row(plain)).not.toContain('name-disclaimer');
  });
});
