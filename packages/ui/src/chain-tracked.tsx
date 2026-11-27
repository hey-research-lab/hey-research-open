import type { ReactNode } from 'react';

import { cn } from './cn';
import { ProjectLogo } from './project-logo';
import { ShipWeeksChart, type ShipWeekSeriesData } from './ship-weeks';

/**
 * A page HEY tracks on another chain (multichain WP3.2, web half; CLAUDE.md "Multichain rules (2026-11-11)", the
 * 2026-11-12 switcher ruling and the 2026-11-14 "web first" ruling): the builder list's row (`ProjectListRow`) and the
 * default card (`ProjectCard`), drawn from the same classes, for a page WP3.1's gate published on that chain.
 *
 *   - Every row says its chain (`ChainChip`: the chain's mark and its name, never colour alone).
 *   - The status cell is the chain's own standing — "Verified Builder on Base" where that chain's row holds the badge,
 *     else "Published on Base" — never a badge lent from another chain (D2) and never a pooled one (D3). A muted line
 *     under it may say what is not measured on that chain.
 *   - The latest ship is a counted ship with no chain or on that chain, its title linking out to its source.
 *   - The token check and valuation cells stay the empty cells the list draws when it has none: HEY reads no market on
 *     another chain (D7 unruled), so no price, valuation or liquidity is ever drawn here.
 *
 * The words come from the caller; nothing here reads a database, a score or a market. The name is the row's (and the
 * card's) one HEY link, to `href`.
 */
export type ChainMark = { id: number; label: string; icon: string };

export type ChainTrackedProject = {
  slug: string;
  name: string;
  /** The project's one page (D4), the row's one HEY link. */
  href: string;
  logoUrl: string | null;
  /** The chains the row is about, each drawn as a chip. */
  chains: readonly ChainMark[];
  /** The line under the name (the project's kind), as the list's narrative line. */
  subline?: string | undefined;
  /** One short muted line under the subline: the chain evidence, in a few words. */
  note?: string | undefined;
  noteTitle?: string | undefined;
  /** The one-line description, drawn on the card. */
  description?: string | undefined;
  /** The chain's own standing: its label, whether it is the badge, and its title. */
  standing: { label: string; badge: boolean; help: string };
  /** A muted line under the standing (what is not measured on that chain). */
  standingNote?: string | undefined;
  latestShip: { title: string; href: string | null; at: string; when: string; day?: string | undefined } | null;
  weeks: ShipWeekSeriesData | undefined;
  /** The card's foot: a fact on the left, a reference on the right. */
  foot?: { left: string; leftTitle?: string | undefined; right?: string | undefined } | undefined;
};

/** One chain, named: its mark and its name, in the chip shape of the list (AA in both themes; the mark is decorative). */
export function ChainChip({ chain, className }: { chain: ChainMark; className?: string }) {
  return (
    <span
      className={cn('inline-flex min-h-5 shrink-0 items-center gap-1 rounded-chip border border-hey-border px-1.5 text-[12px] font-medium leading-4 text-hey-secondary', className)}
      data-testid="chain-chip"
      data-chain-id={chain.id}
    >
      <img src={chain.icon} alt="" aria-hidden="true" width={12} height={12} className="shrink-0 rounded-[3px]" style={{ width: 12, height: 12 }} />
      {chain.label}
    </span>
  );
}

/** The chips of a row, in the order given. */
export function ChainChips({ chains, className }: { chains: readonly ChainMark[]; className?: string }) {
  if (chains.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)} data-testid="chain-chips">
      {chains.map((chain) => (
        <ChainChip key={chain.id} chain={chain} />
      ))}
    </span>
  );
}

/**
 * The chain's standing: the badge's own look ("Verified Builder on Base") where the chain's row holds it, else a quiet
 * outlined chip ("Published on Base"). The label always names the chain.
 */
export function ChainStanding({ standing, className }: { standing: ChainTrackedProject['standing']; className?: string }) {
  return standing.badge ? (
    <span
      className={cn('inline-flex max-w-full items-center rounded-full border border-gold-300 bg-gold-soft px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gold-dark', className)}
      data-badge="verified_builder"
      data-testid="chain-standing"
      title={standing.help}
    >
      {standing.label}
    </span>
  ) : (
    <span className={cn('inline-flex max-w-full items-center rounded-full border border-hey-border px-2.5 py-0.5 text-[12px] text-hey-secondary', className)} data-testid="chain-standing" title={standing.help}>
      {standing.label}
    </span>
  );
}

function Ship({ ship, children }: { ship: NonNullable<ChainTrackedProject['latestShip']>; children: ReactNode }) {
  return ship.href ? (
    <a href={ship.href} rel="noopener" className="v2-row-ship-title v2-row-out" title={ship.title} data-testid="row-ship-source">
      {children}
    </a>
  ) : (
    <span className="v2-row-ship-title" title={ship.title}>
      {children}
    </span>
  );
}

/** One row of the builder list (`ProjectList`, without the Preview column) for a page HEY tracks on another chain. */
export function ChainTrackedListRow({ project }: { project: ChainTrackedProject }) {
  const ship = project.latestShip;
  return (
    <tr role="row" className="v2-list-row" data-testid="project-row" data-slug={project.slug} data-tracked="true">
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
            <span className="v2-row-sub flex flex-wrap items-center gap-x-1.5 gap-y-1" data-testid="row-narrative">
              <ChainChips chains={project.chains} />
              {project.subline ? <span>{project.subline}</span> : null}
            </span>
            {project.note ? (
              <span className="v2-row-note" data-testid="row-note" {...(project.noteTitle ? { title: project.noteTitle } : {})}>
                {project.note}
              </span>
            ) : null}
          </span>
        </span>
      </th>

      <td role="cell" className="v2-cell-status" data-testid="row-status">
        <ChainStanding standing={project.standing} />
        {project.standingNote ? (
          <span className="mt-1 block text-[12px] leading-4 text-hey-muted" data-testid="row-standing-note">
            {project.standingNote}
          </span>
        ) : null}
      </td>

      <td role="cell" className="v2-cell-ship" data-testid="row-latest-ship">
        {ship ? (
          <>
            <Ship ship={ship}>{ship.title}</Ship>
            <time dateTime={ship.at} className="v2-row-ship-age" data-testid="row-last-ship" {...(ship.day ? { title: ship.day } : {})}>
              {ship.when}
            </time>
          </>
        ) : (
          <span className="v2-row-ship-age">No counted ship on record</span>
        )}
      </td>

      <td role="cell" className="v2-cell-weeks">
        <ShipWeeksChart series={project.weeks} />
      </td>

      {/* No market is read on this chain (D7): the empty cells the list draws when it has no check and no figure. */}
      <td role="cell" className="v2-cell-check" data-testid="row-token-check" />
      <td role="cell" className="v2-col-value v2-cell-value" />
    </tr>
  );
}

/** The default card (`ProjectCard`'s look: identity, the standing line, the description, the foot) for a page HEY tracks on another chain. */
export function ChainTrackedCard({ project, className }: { project: ChainTrackedProject; className?: string }) {
  const ship = project.latestShip;
  return (
    <article data-testid="project-card" data-slug={project.slug} data-tracked="true" data-interactive="" className={cn('lg-card group relative flex h-full min-w-0 flex-col gap-3 p-4 sm:p-5', className)}>
      <div className="flex items-start gap-3">
        <ProjectLogo name={project.name} slug={project.slug} logoUrl={project.logoUrl} size={44} className="rounded-[10px] ring-1 ring-inset ring-hey-border" />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-[16.5px] font-semibold leading-[1.25] tracking-[-0.01em] text-hey-ink">
            <a
              href={project.href}
              className="line-clamp-2 [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-hey-ink/30"
            >
              {project.name}
            </a>
          </h3>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-5 text-hey-secondary" data-testid="card-narrative">
            <ChainChips chains={project.chains} />
            {project.subline ? <span className="truncate">{project.subline}</span> : null}
          </p>
        </div>
      </div>

      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5" data-testid="card-builder">
        <ChainStanding standing={project.standing} />
        {ship ? (
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
