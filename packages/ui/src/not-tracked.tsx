import { ACTIVITY_NOT_MEASURED_HEAD } from '@hey/scoring/activity-words';

import { cn } from './cn';
import { ProjectLogo } from './project-logo';
import { ShipWeeksChart, type ShipWeekSeriesData } from './ship-weeks';
import { ActivityChip } from './status';

/**
 * A project HEY lists but does not track (2026-11-13, founder: "now that we have Base, it should be exactly the same as
 * Robinhood's"). The Base preview (CLAUDE.md, Multichain rules, 2026-11-12) is a hand-checked list: HEY measures no
 * activity status, chart, token or market for it. These are the builder list's row (`ProjectListRow`) and the default
 * card (`ProjectCard`) drawn from the same classes, cell by cell, for such a project — so a reader switching chains sees
 * one product — with only what HEY holds:
 *
 *   - the status cell is the status chip in its "Not measured" state, with the caller's reason ("Base tracking starts in
 *     December") — never a measured status, never a badge;
 *   - the 8-week chart is its own "not observed" state (`notObservedShipWeeks`), never a zero;
 *   - the token check and valuation cells are the empty cells the list draws when it has none, never 0 or a placeholder;
 *   - the latest ship is the caller's hand-read title and date, its title linking out to its source.
 *
 * The words come from the caller; nothing here reads a database, a score or a market. The name is the row's (and the
 * card's) one HEY link, to `href`.
 */
export type NotTrackedProject = {
  slug: string;
  name: string;
  /** The project's own page, the row's one HEY link. */
  href: string;
  logoUrl: string | null;
  /** The line under the name (the category), as the list's narrative line. */
  subline?: string | undefined;
  /** Its title: where the subline came from, said in a few words. */
  sublineTitle?: string | undefined;
  /** One short muted line under the subline (the list's note line). */
  note?: string | undefined;
  /** The one-line description, drawn on the card. */
  description?: string | undefined;
  /** Why HEY measures no status: the chip reads "Not measured · <reason>", its title `help`. */
  notMeasured: { reason: string; help: string };
  /** The latest ship as read by hand: its title, a link out to its source, its day and its age in words. */
  latestShip: { title: string; href: string; at: string; when: string; day?: string | undefined } | null;
  /** The 8-week chart's series: `notObservedShipWeeks` for a project whose building HEY does not read. */
  weeks: ShipWeekSeriesData;
  /** The card's foot: a fact on the left (where it is on the chain), a reference on the right (the website's host). */
  foot?: { left: string; leftTitle?: string | undefined; right?: string | undefined } | undefined;
};

/** The chip's words, the status chip's own "Not measured — <reason>" form, so it splits into its head and reason. */
export const notTrackedAnswer = (reason: string): string => `${ACTIVITY_NOT_MEASURED_HEAD} — ${reason}`;

/** The status chip in its not-measured state, for a project HEY does not track (never a measured status). */
export function NotTrackedChip({
  reason,
  help,
  variant = 'surface',
  withReason = true,
  className,
}: {
  reason: string;
  help: string;
  variant?: 'text' | 'surface';
  /** The reason inside the chip ("Not measured · <reason>"); off where the caller prints it under the chip (a list row). */
  withReason?: boolean;
  className?: string;
}) {
  return (
    <ActivityChip status="UNKNOWN" answer={withReason ? notTrackedAnswer(reason) : ACTIVITY_NOT_MEASURED_HEAD} help={help} variant={variant} {...(className ? { className } : {})} />
  );
}

/** One row of the builder list (`ProjectList`, without the Preview column) for a project HEY does not track. */
export function NotTrackedListRow({ project }: { project: NotTrackedProject }) {
  const ship = project.latestShip;
  return (
    <tr role="row" className="v2-list-row" data-testid="project-row" data-slug={project.slug} data-tracked="false">
      <th scope="row" role="rowheader" className="v2-cell-project">
        <span className="v2-row-identity">
          <ProjectLogo name={project.name} slug={project.slug} logoUrl={project.logoUrl} size={36} className="v2-row-logo shrink-0 rounded-[8px] ring-1 ring-inset ring-hey-border" />
          <span className="min-w-0">
            <span className="v2-row-name">
              {/* The row's one HEY link; its target is stretched over the row (`.v2-row-link::after`). */}
              <a href={project.href} className="v2-row-link" data-testid="row-name">
                {project.name}
              </a>
            </span>
            {project.subline ? (
              <span className="v2-row-sub" data-testid="row-narrative" {...(project.sublineTitle ? { title: project.sublineTitle } : {})}>
                {project.subline}
              </span>
            ) : null}
            {project.note ? (
              <span className="v2-row-note" data-testid="row-note">
                {project.note}
              </span>
            ) : null}
          </span>
        </span>
      </th>

      <td role="cell" className="v2-cell-status" data-testid="row-status">
        {/* The chip fits the column; its reason is the short muted line under it, as a row's dated line under its status. */}
        <NotTrackedChip reason={project.notMeasured.reason} help={project.notMeasured.help} withReason={false} />
        <span className="mt-1 block text-[12px] leading-4 text-hey-muted" data-testid="row-not-measured-reason">
          {project.notMeasured.reason}
        </span>
      </td>

      <td role="cell" className="v2-cell-ship" data-testid="row-latest-ship">
        {ship ? (
          <>
            {/* Its source, one press away, above the row's stretched link (`.v2-row-out`). */}
            <a href={ship.href} rel="noopener" className="v2-row-ship-title v2-row-out" title={ship.title} data-testid="row-ship-source">
              {ship.title}
            </a>
            <time dateTime={ship.at} className="v2-row-ship-age" data-testid="row-last-ship" {...(ship.day ? { title: ship.day } : {})}>
              {ship.when}
            </time>
          </>
        ) : (
          <span className="v2-row-ship-age">No ship on record</span>
        )}
      </td>

      <td role="cell" className="v2-cell-weeks">
        <ShipWeeksChart series={project.weeks} />
      </td>

      {/* Nothing HEY holds: the empty cells the list draws when it has no check and no figure, never 0 or a placeholder. */}
      <td role="cell" className="v2-cell-check" data-testid="row-token-check" />
      <td role="cell" className="v2-col-value v2-cell-value" />
    </tr>
  );
}

/** The default card (`ProjectCard`'s look: identity, the status line, the description, the foot) for a project HEY does not track. */
export function NotTrackedCard({ project, className }: { project: NotTrackedProject; className?: string }) {
  const ship = project.latestShip;
  return (
    <article
      data-testid="project-card"
      data-slug={project.slug}
      data-tracked="false"
      data-interactive=""
      className={cn('lg-card group relative flex h-full min-w-0 flex-col gap-3 p-4 sm:p-5', className)}
    >
      <div className="flex items-start gap-3">
        <ProjectLogo name={project.name} slug={project.slug} logoUrl={project.logoUrl} size={44} className="rounded-[10px] ring-1 ring-inset ring-hey-border" />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-[16.5px] font-semibold leading-[1.25] tracking-[-0.01em] text-hey-ink">
            {/* The whole card is the target; the link stays the accessible one (the default card's rule). */}
            <a
              href={project.href}
              className="line-clamp-2 [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-hey-ink/30"
            >
              {project.name}
            </a>
          </h3>
          {project.subline ? (
            <p className="mt-1 truncate text-[13px] leading-5 text-hey-secondary" data-testid="card-narrative" {...(project.sublineTitle ? { title: project.sublineTitle } : {})}>
              {project.subline}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5" data-testid="card-builder">
        <NotTrackedChip reason={project.notMeasured.reason} help={project.notMeasured.help} className="shrink-0" />
        {ship ? (
          // Named, not linked (DISC-7): the card's one link is its name; the source is one press away on the project's page.
          <p className="min-w-0 grow basis-[9rem] text-[13px] leading-5" data-testid="card-latest-signal" title={ship.title}>
            <span className="font-medium text-hey-ink">{ship.title}</span>{' '}
            <time dateTime={ship.at} data-testid="card-last-ship" className="whitespace-nowrap tabular-nums text-hey-muted" {...(ship.day ? { title: ship.day } : {})}>
              · {ship.when}
            </time>
          </p>
        ) : null}
      </div>

      {project.description ? (
        <p className="line-clamp-2 text-[13.5px] leading-[1.5] text-hey-secondary" data-testid="description">
          {project.description}
        </p>
      ) : null}

      {project.foot ? (
        <div className="mt-auto border-t border-hey-border pt-3">
          <p className="flex min-w-0 items-baseline justify-between gap-3 text-[13px]" data-testid="card-foot">
            <span className="min-w-0 truncate text-hey-secondary" {...(project.foot.leftTitle ? { title: project.foot.leftTitle } : {})}>
              {project.foot.left}
            </span>
            {project.foot.right ? (
              <span className="min-w-0 shrink-0 truncate text-hey-secondary" data-testid="website">
                {project.foot.right}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
    </article>
  );
}
