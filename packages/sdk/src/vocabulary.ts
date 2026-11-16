/**
 * The known values of HEY's public state vocabularies (2026-11-13, additive), as plain lists a client can switch on,
 * validate against or print a table from.
 *
 * Each list is a copy of the vocabulary HEY's own code declares (`@hey/scoring`'s `STATE_VOCABULARIES`, published at
 * /developers under "States and reasons" and in the OpenAPI document as `x-hey-known-values`). The SDK carries no
 * workspace dependency, so the values are spelled here and held equal to that vocabulary by a test in the web app
 * (`sdk-vocabulary-parity.test.ts`): a value HEY adds fails the build until it is listed here too.
 *
 * The lists are **open**. They only grow, and a value is never renamed or given a new meaning (machine rule 10); a
 * response may carry a value a client built against an older SDK does not know. Read such a value as unknown — never
 * fail on it — which is why the response types stay `string` and these are `readonly string[]`, not closed unions.
 */

/** What HEY claims about a project's activity (`HeyProject.activityStatus`). `UNKNOWN` is "not measured", never "abandoned". */
export const HEY_ACTIVITY_STATUSES: readonly string[] = ['SHIPPING', 'ACTIVE', 'QUIET', 'DORMANT', 'RESUMED', 'UNKNOWN'];

/** Why an `UNKNOWN` status is unknown (`HeyProject.activity.unknownReason`): a gap in what HEY reads, never a finding about the team. */
export const HEY_UNKNOWN_ACTIVITY_REASONS: readonly string[] = ['no_builder_signal', 'held_as_context', 'no_readable_source', 'builder_sources_unavailable'];

/** The tracked token's market status (`HeyProject.tokenMarket.status`): context only, never an input to activity status. */
export const HEY_TOKEN_MARKET_STATUSES: readonly string[] = ['ACTIVE_MARKET', 'LOW_LIQUIDITY', 'NO_LIQUIDITY', 'TRADING_INACTIVE', 'LIQUIDITY_REMOVED', 'MARKET_ABANDONED', 'INSUFFICIENT_DATA'];

/** The classifier's reason behind a market status (`HeyProject.tokenMarket.reason`). */
export const HEY_TOKEN_MARKET_REASONS: readonly string[] = [
  'trades_observed',
  'no_trades_24h',
  'no_liquidity_reading',
  'no_recent_reading_after_market',
  'readings_stale',
  'no_readings',
  'liquidity_reading_stale_after_market',
  'launch_pool_trading',
  'launch_pool_volume_unknown',
  'launch_pool_no_trades',
  'readings_implausible',
  'liquidity_in_another_pool',
  'no_volume_24h',
  'pool_readings_disagree',
  'removal_unconfirmed',
  'liquidity_gone_after_market',
  'no_liquidity',
  'liquidity_far_below_peak',
  'liquidity_below_threshold',
  'liquidity_below_exit_threshold',
  'liquidity_and_volume',
  'not_a_fungible_token',
  'reading_not_current',
  'volume_unknown',
  'liquidity_not_current',
  'liquidity_quote_side_thin',
];

/** Whether the project names its tracked token (`HeyProject.tokenVerification.status`). */
export const HEY_TOKEN_VERIFICATION_STATUSES: readonly string[] = ['VERIFIED', 'UNVERIFIED', 'MISMATCH'];

/** The reason the token check was written with (`HeyProject.tokenVerification.reason`); `not_checked` is "not read", never a "no". */
export const HEY_TOKEN_VERIFICATION_REASONS: readonly string[] = [
  'onchain_signature',
  'site_names_contract',
  'deploy_record_in_own_repo',
  'site_names_another_contract',
  'issuer_token',
  'site_disclaims_contract',
  'site_unreachable',
  'site_names_contract_contested',
  'site_off_page_names_contract',
  'site_lists_contract_among_others',
  'owner_has_not_published_contract',
  'self_reported',
  'launchpad_record_site_silent',
  'launchpad_record',
  'market_listing',
  'site_silent',
  'not_checked',
];

/** What stands behind a ship (`HeyShip.verification`); self-reported and source-backed are different states. */
export const HEY_SHIP_VERIFICATIONS: readonly string[] = ['PUBLICLY_VERIFIED', 'ADMIN_VERIFIED', 'SOURCE_LINKED', 'SELF_REPORTED', 'DISPUTED', 'RETRACTED'];

/** Why the Discovery Gap (and so Under the Radar) is not measured (`score.discoveryGapWithheld`): not measured, never zero. */
export const HEY_DISCOVERY_GAP_WITHHELD_REASONS: readonly string[] = [
  'no_token',
  'market_not_live',
  'token_not_the_projects',
  'market_too_thin',
  'active_pool_not_read',
  'no_market_reading',
  'no_build_momentum',
  'activity_unknown',
];

/** Why Still Building is not measured (`score.stillBuildingWithheld`): not measured, never "not held". */
export const HEY_STILL_BUILDING_WITHHELD_REASONS: readonly string[] = [
  'market_not_live',
  'token_not_the_projects',
  'market_too_thin',
  'valuation_not_plausible',
  'no_token',
  'active_pool_not_read',
  'no_market_reading',
  'activity_unknown',
  'not_scored',
  'no_tracked_high',
  'builder_sources_unavailable',
];

/** Why HEY prints no live link to a project's official X account (`HeyOfficialX.linkHeld`). */
export const HEY_OFFICIAL_X_LINK_HOLDS: readonly string[] = ['handle_reassigned', 'links_other_project', 'not_the_project', 'copied_pair', 'account_of_another_page'];
