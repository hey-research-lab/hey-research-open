/**
 * What holds an official X account's link, and the words for each hold — one vocabulary (2026-11-12, state-machine
 * audit F6).
 *
 * Before this module the five holds were spelled as a literal union in six places (the card fields, the UI card, the
 * API view, the SDK, the OpenAPI schema) and worded by an if-chain in the MCP, and the admin console handled two of the
 * five: on `links_other_project`, `copied_pair` and `account_of_another_page` it printed "active" and offered a
 * moderator's hold on an account already held. Every reader now takes the list, the type and the words from here; the
 * rule that decides a hold stays in `@hey/domain` `x-accounts/held.ts`. A hold added to the list without words here
 * fails the type check.
 *
 * A word module: it imports nothing at run time (`word-modules.test.ts`), so the MCP and the agent contract read it
 * without carrying the scorer.
 */

/** Every reason a card holds the account's link (the API's `officialX.linkHeld`); additive, never renamed. */
export const OFFICIAL_X_LINK_HOLDS = ['handle_reassigned', 'links_other_project', 'not_the_project', 'copied_pair', 'account_of_another_page'] as const;
export type OfficialXLinkHeld = (typeof OFFICIAL_X_LINK_HOLDS)[number];

/** Whether a stored or sent value is one of the holds (a reader's narrowing; null and unknown values are not). */
export function isOfficialXLinkHeld(value: string | null | undefined): value is OfficialXLinkHeld {
  return typeof value === 'string' && (OFFICIAL_X_LINK_HOLDS as readonly string[]).includes(value);
}

/**
 * Who lifts a hold:
 *  - `moderator_confirms`: the handle answers for another account; a moderator confirms the new one
 *    (`x-account.confirm-reassigned`);
 *  - `moderator`: a moderator held it as not the project's and may release it (`x-account.release-hold`);
 *  - `hey`: HEY holds it itself from what it read — another project's site in the profile, a copied pair, another
 *    page's account — and lifts it on the read that no longer finds it; no console press moves it.
 */
export type OfficialXHoldLiftedBy = 'moderator_confirms' | 'moderator' | 'hey';

export type OfficialXLinkHoldWords = {
  liftedBy: OfficialXHoldLiftedBy;
  /** The MCP's and the agent's line, after "X account @handle" or "X handle @handle": what the hold says. */
  machine: (handle: string, checkedSuffix: string) => string;
  /** A short note for the operator console: why there is (or is not) a press to make. */
  operatorNote: string;
};

/** The words for every hold. `checkedSuffix` is " (checked 2026-10-18)" or "". */
export const OFFICIAL_X_LINK_HOLD_WORDS: Readonly<Record<OfficialXLinkHeld, OfficialXLinkHoldWords>> = {
  // A handle now answering for another account is held until a moderator confirms (founder ruling 4, 2026-10-18).
  handle_reassigned: {
    liftedBy: 'moderator_confirms',
    machine: (handle, checked) => `X handle @${handle} now belongs to a different account; link held${checked}`,
    operatorNote: 'Held until a person confirms the new account.',
  },
  // Another project's account (2026-10-18): its profile links that project's site, not this one's.
  links_other_project: {
    liftedBy: 'hey',
    machine: (handle, checked) => `X account @${handle} links another project's site, not this one's; link held${checked}`,
    operatorNote: 'Held by HEY: the profile links another published project’s site. The next read that finds this project’s site lifts it.',
  },
  // A moderator held the account as not the project's (2026-10-19).
  not_the_project: {
    liftedBy: 'moderator',
    machine: (handle) => `X account @${handle} is not this project's account; link held by a moderator`,
    operatorNote: 'Held by a moderator as not the project’s account.',
  },
  // HEY's own holds (2026-11-09): a borrowed account copied onto the page, or another HEY page's account.
  copied_pair: {
    liftedBy: 'hey',
    machine: (handle, checked) => `X account @${handle} reads as another party's account, not this project's; link held${checked}`,
    operatorNote: 'Held by HEY as a copied pair (automatic hold, recomputed after every X read). Nothing to press here.',
  },
  account_of_another_page: {
    liftedBy: 'hey',
    machine: (handle, checked) => `X account @${handle} is another HEY page's account, not this one's; link held${checked}`,
    operatorNote: 'Held by HEY: another published page shows this account and stands behind it (automatic hold, recomputed after every X read). Nothing to press here.',
  },
};
