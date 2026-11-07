# Public API changelog

Every change to HEY's public API that a partner or an agent can see, dated, newest first: what was
added, what changed meaning, what is deprecated. The site renders this file at
[/developers/changelog](/developers/changelog), with an RSS feed at
[/developers/changelog/feed.xml](/developers/changelog/feed.xml), and the OpenAPI document links it.

`/api/*` changes additively: a field is added, never renamed, removed or given a new meaning, and a
change of meaning needs `/api/v2` with at least 90 days of overlap. When HEY narrows what a value
returns because the old answer was not true — a truth repair — the change is dated here and in the
[public API reference](PUBLIC_API.md) the day it ships, and the old population keeps a name of its
own. Changes before 2026-10-16 are dated where they happened, in the reference.

The TypeScript SDK keeps its own changelog in its package; its entries are summarised here.

## 2026-11-08 — An ambiguous agent query is an answer, slug on the agent contract, unread ships are null, and which days events7d adds up

### Changed

- `GET /api/agent/{capability}` (`research_project`, `builder_status`, `unknowns`): a `q` that several published
  projects match answers **HTTP 200 with `status: "ambiguous"`** and the candidates, where it answered HTTP 400
  `status: "invalid_request"`. Growth rule 3 says several matches answer `ambiguous`, and generic clients treat a 4xx as
  a failure. The candidates are in the new top-level `candidates` and `candidatesTotal` and, unchanged, in
  `error.candidates` / `error.candidatesTotal` with `error.code: "ambiguous"`; `subject` and `citation` stay null and
  HEY picks none. The MCP tool `research_answer` no longer marks it `isError`. `status` gains the value `ambiguous` in
  the OpenAPI schema and the SDK.
- Truth repair. `GET /api/projects/{slug}`: `ships` is `null`, never `[]`, when HEY recorded no ship and does not
  measure the project's building (`activityMeasuredSql`: activity unknown, or no builder source it reads and no counted
  ship), with the new `shipsNotMeasured: { reason: "activity_not_measured", text }`. `[]` stays a measured none.
  Machine rule 4: unknown is null with its reason.

### Added

- `GET /api/agent/{capability}`: `slug`, the same as `project`, on `research_project`, `builder_status` and `unknowns`
  (an old slug answers 308 to the current one as `project`; sending both is refused).
- `events7dDays`, `events7dFromDay` and `events7dToDay` on `GET /api/projects/{slug}`'s `onchainActivity` and the
  snapshot's `onchain`: how many UTC days `events7d` adds up, and which. Below 7 the figure is no week's total.
  `events7d` keeps its meaning.

## 2026-11-03 — A Proof of Ship window HEY never read is not measured, two new validator declines, and Proof of Ship on NEAR

### Changed

- Truth repair. `GET /api/v1/proof-of-ship/ships`: a window HEY cannot measure no longer answers `ships: 0`. It answers 200 with
  `ships`, `evidenceIds`, `evidenceUrls` and `evidenceHash` all `null`, plus `reason` and `reasonText` (both new, present
  only then): `window_before_hey_read` when the window began before HEY first recorded the project (a January 2024
  window on a project HEY first read in 2026 answered `ships: 0`), and `activity_not_measured` when HEY counted no ship
  in the window and does not measure the project's building (activity unknown, no builder source it reads, or every one
  unavailable). A measured window, a 0 included, is unchanged, and a window holding a counted ship is never withheld by
  the second reason. HEY's ERC-8004 validator declines exactly these windows. The OpenAPI schema
  (`getProofOfShipShips`) marks the four fields nullable and adds `reason`. Machine rule 4: unknown is null with its
  reason, never 0.

### Added

- `GET /api/agent/stats`: `erc8004Validations.chains[].declined` may carry two new reasons: `agent_not_tied` (the asking
  agent's owner or declared wallet in the ERC-8004 Identity Registry is not one of the project's Proof of Ship payout
  ties) and `activity_not_measured` (as above). `definitions.erc8004Validations` names them. Additive; every other field
  is unchanged. The validator is not switched on in production yet, so no request has been read.
- `GET /api/v1/proof-of-ship/attestation`: `escrow` may also be `near:<account id>`, a NEAR mainnet escrow account the
  host lists (`HEY_SHIP_NEAR_ESCROWS`). HEY signs the same `Ships` struct over the same counted set, for the same tied
  `builder`, with the same key, under the NEAR escrow's fixed domain
  `EIP712Domain(string name,string version,uint256 chainId,bytes32 salt)`: "HEY Proof of Ship", "1", chain id 397,
  `salt = keccak256(utf8(account id))`. A malformed NEAR account id (capitals, a testnet account, anything NEAR's
  account-id rules refuse) is `400 invalid_parameter`; an unlisted one `400 escrow_not_configured`. Every answer, for
  either escrow, adds `escrow` (as signed for), `escrowKind` (`evm` or `near`), `digest` (the EIP-712 digest) and
  `typedData` (the whole payload, `types.EIP712Domain` included). Additive: a Robinhood Chain escrow's `domain`,
  signature and every other field are unchanged. See [Proof of Ship](PUBLIC_API.md).

## 2026-11-02 — The payout addresses HEY would sign Proof of Ship for, and feedback for HEY's agent

### Added

- `GET /api/agent/stats`: `erc8004Feedback` — the feedback other agents left for HEY's agent in the ERC-8004 Reputation
  Registry (`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`), counts only: `{ registryAddress, events, chains: [{ chainId,
  chain, heyAgentId, registry, basis, collectedFrom, readThroughBlock, readThroughAt, readAt, stale, totals: { feedback,
  revoked }, last7Days, last30Days, values: { below0, from0to20, from20to40, from40to60, from60to80, from80to100,
  above100 }, days, reason? }] }`, one entry each for Robinhood Chain (agent 8783), Ethereum (56081) and Base (1148006).
  A chain HEY has not read has every figure `null` and `reason: 'not_read'`, never 0. No client address, tag or URI is
  returned. `definitions.erc8004Feedback` carries the definition. Additive; every other field is unchanged.
- `GET /api/v1/proof-of-ship/tie?slug=`: for one published project, every address the attestation route would accept
  as `builder` for that slug right now — `{ slug, currentSlug, payable, ties: [{ kind, address }], reason? }`, `kind`
  being `wallet_claim` or `token_deployer` and `address` checksummed, as the attestation's `builder`. Computed by the
  attestation's own tie rule, so a funder fills in a bounty's payout address with one the escrow can pay. With no tie,
  `reason` says which condition failed first (`no_token`, `token_not_verified`, `issuer_token`,
  `site_disclaims_contract`, `site_names_another_contract`, `contested`, `no_tie`). It signs nothing, so it answers
  while attestations are paused and then adds `attestationsPaused: true`. `slug` is read exactly as the attestation
  reads it (`400 invalid_parameter`, `404 not_found`). Public for 60 seconds, no provider call, nothing stored. In the
  OpenAPI document as `getProofOfShipTie`. See [Proof of Ship](PUBLIC_API.md).
- `GET /api/search/suggest`: a `project` row also carries `slug` (the exact HEY slug) and `logoUrl` when the project has a
  logo, so a type-ahead outside HEY fills the slug without parsing `target` and draws the logo. Additive.
- `GET /api/v1/proof-of-ship/ships?slug=&since=&until=`: the Proof of Ship counted set for one published project in a
  closed window, unsigned — `{ slug, currentSlug, since, until, ships, evidenceIds, evidenceUrls, evidenceHash,
  definition }`, `evidenceHash` being keccak256 of the evidence ids joined by commas (the attestation's `evidence`). Only a
  window that has ended and is at most 400 days long (`400 invalid_parameter` otherwise), `404 not_found` for a slug no
  published page answers to. Public for 300 seconds, no provider call, nothing stored. It is the `responseURI` of HEY's
  ERC-8004 validation responses. In the OpenAPI document as `getProofOfShipShips`.
- `GET /api/agent/stats`: `erc8004Validations` — the ERC-8004 validation requests that named HEY's validator in the
  Validation Registry (`0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58`) and what HEY did with each, counts only:
  `{ registryAddress, event, response, claimFormat, tag, chains: [{ chainId, chain, answers, registry, readThroughBlock,
  readAt, requestsRead, answered, responses: { shipped, noneCounted }, pending, reverted, declined: { <reason>: n },
  reason? }] }`, one entry each for Robinhood Chain and Base (answered) and Ethereum (read only). A chain HEY has not read
  has every figure `null` and `reason: 'not_read'`, never 0. No agent id, requester or request transaction is returned.
  `definitions.erc8004Validations` carries the definition. Additive; every other field is unchanged.

## 2026-11-01 — The market answer says why its token check reads as it does

### Added

- `GET /api/projects/{slug}/market` carries `verificationReason` beside `verification` when HEY recorded a reason
  (`site_disclaims_contract`, `site_names_contract`, …). Additive. A token the project's own site disowns now reads
  "not confirmed by the project" in HEY's MCP `get_token_market`, with its figures named as the tracked token's, never
  the project's valuation; `find_projects` drops such a token's ticker and says the same of its valuation.

### Changed

- A Robinhood Stock Token named in a project's deployment files is never that project's Robinhood Chain evidence
  (free-data rule 15). Three pages that held the Verified Builder badge on such files alone are integration records
  now, so `catalogue.verifiedBuilders` and `catalogue.verifiedBuildersOnChain` agree again (1,203 on 2026-11-01).

## 2026-10-31 — The project answers are typed in the OpenAPI document

### Added

- `/openapi.json` names every key of `GET /api/projects/{slug}` (`#/components/schemas/ProjectDetail`, which was the
  blank `Object`), of each `GET /api/projects` item (`Project`) and of each `GET /api/ships` item (`Ship`), with its
  type, nullability and meaning: `OfficialX`, `TokenMarketState`, `TokenMarketDetail` (with `readingObservedAt` and
  `figuresScope`), `ProjectScore` (with `stillBuildingWithheld`), `OnchainActivity`, `ProjectMarketReading`,
  `TokenVerification`, `UnderTheRadar`, `Token`, `CodeSubstance`, `CodeWeek`, `CatalogueCounts` and `MarketCoverage`.
  Documentation only: no payload changed. Every object stays open (`additionalProperties: true`), since fields are
  added and never change meaning. `OfficialX` now also lists as required the keys the API always sent beside `handle`,
  `url`, `status` and `checkedAt` (`linkHeld`, `corroboration`, `corroborationCheckedAt`, `foundByHey`).

## 2026-10-28 — Counted ships in the ships CSV, and thin pages last in the default orders

### Added

- `GET /api/export/ships?view=counted`: the feed's fold (as `view=feed`) over counted ships only — the ships that move
  an activity status, the list `/ships` now opens on. `view=feed` and `view=records` are unchanged.

### Changed

- `GET /api/projects` orders a page with no building record — activity status `UNKNOWN`, no counted ship ever, and no
  official builder source (repository, organisation, website, docs, changelog or feed) — after the pages with one, as
  a tie-break and never a filter: in the default order (`sort=activity`, no tab) inside the tail of pages that never
  shipped (every page with a ship still leads by its newest ship), and first under `tab=new-on-hey` (then newest
  first, as before). The `/search` page does the same for its relevance, `newest` and `activity` orders. No field,
  filter, count or `catalogue` figure
  changes, and the market orders (`marketCap`, `liquidity`, `volume24h`) are unchanged. On 2026-10-28, 2,159 of 5,256
  published pages were thin (2,112 a token and nothing else).

## 2026-10-24 — Proof of Ship attestations

### Changed

- `GET /api/v1/proof-of-ship/attestation` counts a ship only when HEY first recorded it inside `[since, until]` (a ship
  read after `until` no longer counts), and at most one ship of each kind — a release, a contract deployment or
  upgrade, a code week, any other entry — per UTC day of HEY's first record. `evidenceIds` lists exactly what was
  counted; `definition` says so. Activity status and scores are unchanged.
- `builder` ties only by a wallet-signature claim made for the project's current tracked token, or that token's
  recorded deployer measured as no serial launcher, and only while the token stands as the project's own (verified,
  not an issuer's, not disowned or passed over by the project's site, not contested by a lookalike). Otherwise
  `403 builder_not_tied`, as before.

### Added

- `slug` accepts an old slug that redirects to a published page; HEY signs over the slug as asked. The answer adds
  `currentSlug`. The endpoint is now in the OpenAPI document (`getProofOfShipAttestation`), llms.txt and /developers.

- `GET /api/v1/proof-of-ship/attestation?slug=&builder=&since=&until=&escrow=`: the ships HEY counts as building for
  one published project in the window, by the same rule as activity status and first recorded by HEY inside it (a code
  week only when its whole week is), with their sorted `ship:<uuid>` ids and receipt pages, signed as EIP-712 typed data
  (`Ships(bytes32 project,address builder,uint64 since,uint64 until,uint32 ships,bytes32 evidence,uint64 issuedAt)`,
  domain "HEY Proof of Ship" v1, chain 4663) for the open-source `ShipEscrow` contract — only for a payout `builder`
  HEY's evidence ties to the project (`builderTie`: `wallet_claim` or `token_deployer`). New error codes
  `escrow_not_configured` (400), `builder_not_tied` (403) and `not_configured` (503). Additive: no existing field or
  route changes. See [Proof of Ship](PUBLIC_API.md).

## 2026-10-22 — Listings, partner cards and snapshots say what they read

### Added

- `adjustedParameters` on `GET /api/projects` and `GET /api/ships`: each value read otherwise than sent —
  `limit` above 48 or not a number, `offset` below 0 or above 20,000, a single-value parameter sent twice — with
  `parameter`, `value`, `readAs` and `reason` (`above_maximum`, `below_minimum`, `not_a_number`, `not_an_integer`,
  `repeated`). The values are capped as before; now the answer says so.
- `activity.releases_measured` on the `/api/v1/scan` card: false when HEY reads no repository, changelog or feed
  releases come from, or building is not measured. `releases_30d` keeps its value and meaning; print it only beside
  `releases_measured: true`.
- `identity.officialX` on `GET /api/projects/{slug}/snapshot` (and MCP `get_project_snapshot`), the card's own field:
  `status`, `checkedAt`, `linkHeld`, `corroboration`.
- `eventsDay` beside `events24h` on the project detail's `onchainActivity` and the snapshot's `onchain`: the UTC day
  the count is for, the newest day HEY read — never a rolling 24 hours.
- `chain.tokensTradedBasis: "busiest_day"` on every weekly report (stated on read for older ones) and
  `chain.tokensTradedDay` on reports written since: `tokensTraded` is the busiest day's distinct count, never a total.

### Changed

- `has=liveMarket` (truth repair): only projects whose tracked token has a market that is not gone. It also passed
  every project with no token — about 2,000 of 3,619 rows — while `catalogue.marketCoverage.liveMarket` counted
  tokens only. The documented meaning ("card facts the project must have") is unchanged; the list now matches it.
- A repeated `has=` or `type=` is read as one comma-separated list; the second value was dropped.
- `GET /api/v1/scan?chain=abc` (a chain that is not digits) is a 400 `bad_request`, never `found: false,
  reason: "chain"`.
- A token's earlier depth reading older than 7 days is no longer sent as `liquidity` on a card when the current
  reading carries none (absent, never 0): the market classifier already calls such depth not current. The detail now
  sends the same earlier figure the card sends.
- `usage.methodEvents` is `null` where HEY holds no usage figures (no contract watched), never zeros. The key is
  always sent; SDK `HeyUsageSummary.methodEvents` is typed `… | null`.
- `activity_applies_to_token` (truth repair) on `/api/v1/scan`, `/api/v1/builder` and `/api/token/{chainId}/{address}`
  is also `false` for a token whose verification reason is `site_disclaims_contract`: the project's own site names
  this contract and says it is not the project's token. Its meaning — whether the project's building may be read as
  this token's — is unchanged; it was `true` for that case, which the project page and the scorer already treated as
  not the project's. Such a card carries no `cta`, as for `MISMATCH`.
- `/api/projects/{slug}/market` `lastTradeDay` counts complete UTC days only, and a day's trading needs a measured
  volume above $1 (the classifier's own definition); a sub-dollar day is no trade day.
- MCP: every per-project tool reads `project` as `slug` and `slug` as `project`, and a list argument sent as one string
  (`domain: "market,build"`) as the list REST reads; `get_changes` prints a numeric move as money or a rounded count;
  `find_projects` dates a liquidity figure read more than a day ago.

### Fixed

- The OpenAPI descriptions of `/api/v1/scan`, `/api/v1/builder` and `/api/token/{chainId}/{address}` name the 400 for a
  well-formed address that is not a token identity (the burn address).

## 2026-10-20 — One change, explained

### Added

- `GET /api/projects/{slug}/explain?fact=build.change[&event=<ledger id>]` (SDK `HeyExplainFact`, `projects.explain(slug,
  'build.change', { event })`; MCP `explain_fact` with `event`): one change explained, from HEY's own tables, with no
  provider or model call. Without `event`, the project's latest builder change; with it, that public change of this
  project (`404` otherwise; an id that is not a ledger id is `400 invalid_event`). The answer adds `change`
  (`HeyChangeExplanation`, `change-explain-v1`):
  - `stage.observed` — `announcement`, `code`, `maintenance`, `release`, `deployment`, `upgrade`, `interface`,
    `source_verification` (the explorer showing verified source; never a deployment), `site_change`, `owner_update`,
    `hey_reading` — with `stage.notObserved` (code is not a deployment; an announcement is not code);
  - `reportedBy.kind` (`team_self_report`, `team_source`, `chain_record`, `explorer_record`, `third_party_record`,
    `hey_reading`) and `corroboration` (`corroborated` only by a record HEY read itself — the chain, the explorer, a
    package version published from the same repository with the release's exact version, or HEY's review);
  - `releaseDeployment.state` — `established` only when the stored release text names the exact contract or
    implementation address the project holds; never by timing (`not_established`, reason `no_exact_reference` or
    `release_text_truncated`);
  - `activity` — calls to a contract tied to the change, own functions (`ownFunctionCalls`) apart from ERC-20 calls
    (`tokenStandardCalls`), over the seven days ending on the coverage's newest day; `SHARED_INFRASTRUCTURE` for a
    shared contract, `NOT_WATCHED`/`NOT_READ` never zero; `success` is always `not_measured`; `aroundUrl` opens the
    before/after read (observed context, never a cause);
  - `time` — `occurredAt` (null when no source dates it), `precision`, `detectedAt`, `recordedAt`, `basis`
    (`source_dated` or `observed_by_hey`);
  - `standing` — evidence withdrawn since is never cited and is listed here; `unknowns[]` — what HEY does not know.
- The snapshot's Research Summary: the `latestChange` line carries `change`, the same object (`HeySummaryLine.change`).
  The line's `text`, `tag` and `evidence` are unchanged.
- The partner builder card (`GET /api/v1/builder`): `latest_change.explanation` — `headline`, `stage`, `reported_by`,
  `corroboration`, `release_deployment`, `activity`, `call_success` (`not_measured`), `time_basis`, `standing`,
  `unknowns`, `explain_url`; null when HEY could not read it.
- `GET /api/projects/{slug}/around/{eventId}`: a field `ownCalls` — calls per covered day to the watched contracts' own
  functions, ERC-20 transfers and approvals left out. `calls` keeps its meaning (ERC-20 included).

### Changed

- The partner builder card's `latest_change` now picks its event by the Research Summary's rule (the project's own
  builder change before HEY's reclassifications, newest by the source's date), the rule the Telegram card and the
  homepage Check card also use. Lock events, which left the builder story on 2026-10-19, are no longer named there; a
  verified-source record (`contract.deployed`) and a source added, lost or restored now can be. The field's meaning —
  the newest builder-side change — is unchanged.
- Truth repair: an `impl:<chain>:<address>:rpc:<uuid>` receipt is withdrawn (`superseded`) when an upgrade log already
  explains it, and (`moderation_hidden`) when its upgrade ship was withdrawn by a moderator — exactly when the change
  ledger retracts the event. It read live before.
- Truth repair: the before/after read (`/around/{eventId}`) reads usage days through the same shared-infrastructure
  re-roll as the usage section, so stored days that counted a shared contract (the v4 PoolManager) are not compared;
  a project is watched only through coverage the method watch reads.

## 2026-10-19 — An account found by name, and the partner card's market words

### Added

- `officialX.foundByHey` (cards, profiles, SDK `HeyOfficialX`): `true` when HEY found the account by the project's name —
  its profile links the project's site, but the project's own pages do not name it — and no person has verified it yet.
  Such an account is never `corroboration: mutual_site_link`, its posts are not shown and it is never tagged. `false`
  otherwise. Additive.
- The partner card's `market_status` (`GET /api/v1/scan`, `GET /api/v1/builder`) gains `reason` (the stored classifier
  reason, or null) and `label` (the words the project page prints, e.g. "Launch pool only", "Readings not confirmed").
  `status` and `observed_at` keep their meaning. Additive.
- The CSV export of projects gains a last column, `x_withheld`: why `x_url` is empty for an account HEY holds back
  (`handle_reassigned`, `links_other_project`, `not_the_project`, `SUSPENDED`, `UNAVAILABLE` or `NOT_FOUND`).

### Changed

- A truth repair (2026-10-19 audit): `officialX.corroboration` is never `mutual_site_link` for an account HEY found by
  name and no person verified — the site never linked it, so the link is one-way. `x_url` in the CSV export and
  `officialX` in the `/data` project records are left empty or out for a held or dead account rather than named as an
  official link.

## 2026-10-18 — Partner reads say what the page says

### Changed

- `officialX.linkHeld` gains a second value on 2026-10-19, `not_the_project`: a moderator held the account the project's
  sources name as not the project's (a famous person's, a company's or a placeholder the page borrowed). Do not link or
  tag it. Additive. The search keys (`?q=` on `/api/projects`, suggest, MCP `find_projects`) no longer match the handle of
  an account HEY read as suspended, gone, reassigned, another project's or held.
- `officialX.linkHeld` (cards, profiles, SDK `HeyOfficialX`, MCP lines) gains a value, `links_other_project`: the
  account's own profile links another published project's site and not this project's, so the handle is that
  project's account. Do not link or tag it. Additive (machine rule 10): `handle_reassigned` and `null` keep their
  meaning; a client that knows only those should treat any non-null value as "held".

- `has=x` and card completeness (the default order's head start) no longer count an official X account HEY last
  read as `SUSPENDED` or `NOT_FOUND` (founder ruling, 2026-10-18). `UNAVAILABLE` and unread accounts still
  count. No field changed meaning: `officialX` is still sent for such a card, with its `status`.
- `GET /api/v1/builder`: `hey_status_label` and `hey_status_help` are the project page's own words
  for the status. An UNKNOWN status read "Activity unknown" here while the page, `/api/v1/scan`
  (`status_label`) and `/api/token/{chainId}/{address}` (`activityLabel`) said "No builder source
  linked" or "Activity not measurable"; the three by-contract reads now print the same words for
  every state. `hey_status` and `status` are unchanged.
- A code week still running reads by absolute days in every partner field — "Code changes, week
  starting 2026-10-12 (to 2026-10-17)", never a range ending in days that have not happened:
  `/api/v1/builder`'s `latest_meaningful_ship.title` and `latest_change.summary` (as
  `last_code_activity.summary` has since 2026-10-16), `/api/v1/scan`'s `activity.last_ship_title`
  and `/api/token/{chainId}/{address}`'s `project.lastShip.title`. A finished week keeps its range.
- `GET /api` starts with the agent contract (`/api/agent`) and names one read by contract, the
  Partner Card (`/api/v1/builder`); `/api/token` and `/api/v1/scan` are described as the chat-line and
  Chit-card shapes of the same answer.

### Added

- `officialX.status`, `officialX.statusReason` and `officialX.checkedAt` on every project card
  (`/api/projects` and its tabs) and on the dossier (`/api/projects/{slug}`): what HEY's last read of the
  project's official X account found — `ACTIVE`, `SUSPENDED`, `UNAVAILABLE`, `NOT_FOUND`, or `null` with
  `statusReason` (`not_read`, `read_failed`) when HEY holds no read of the handle — and when. `handle` and
  `url` are unchanged. Identity context only: no status, score, order or filter reads it. OpenAPI
  `#/components/schemas/OfficialX`; SDK types `HeyOfficialX`, `HeyOfficialXStatus`. Every account reads
  `status: null` until the reads are switched on.
- MCP `find_projects` and the other listing lines state an official X account HEY last read as suspended,
  unavailable or not found, with the date.
- `officialX.linkHeld`, `officialX.corroboration` and `officialX.corroborationCheckedAt` on every card and on the
  dossier (founder rulings, 2026-10-18): `linkHeld: "handle_reassigned"` when the handle now answers for a
  different X account than the one HEY first read — HEY holds the link until a moderator confirms, so do not
  link it; `corroboration: "mutual_site_link"` when the account's profile links the project's own site, as of
  `corroborationCheckedAt` — trust in the account itself, never a source's confidence, indexing, status, score
  or order. All three are `null` otherwise. SDK `HeyOfficialX` gains them as optional fields; MCP listing lines
  state a held handle and a mutual link, dated.
- Every answer the per-minute bucket counted states it: `ratelimit-limit` and `ratelimit-policy`
  (`120;w=60`), and on a private (keyed) answer `ratelimit-remaining`. An anonymous answer is cached
  at the edge and served to other callers, so it never carries one caller's remainder. All three are
  readable from a browser.
- A write method sent to `/api/v1/builder`, `/api/v1/scan`, `/api/token/...` or `/api/projects`
  answers `405 method_not_allowed` in the error envelope, with its CORS headers and `allow` (it was
  an empty body with no content type).
- The error table names `invalid_evidence_id`, `invalid_cursor`, `invalid_json`, `source_required`
  and `method_not_allowed`, which the API already answered.
- OpenAPI: `401`, `403` and `503` on every operation; the Partner Card's `404` typed
  (`PartnerNotFound`, with `scan_url`) and its `text/plain` and `text/markdown` forms; the token
  lookup typed (`TokenLookup`); `components.headers` for the request id, the API version, the budget
  and the monthly allowance; `/api/reports/monthly[/{month}]`, `/api/agent/stats`,
  `/api/export/projects`, `/api/export/ships` and `/api/share/chain-day`; a definition for every
  `tab` value; and links to this changelog.
- `/.well-known/security.txt`: where to report a vulnerability in HEY itself.
- This changelog and its feed.
- SDK 0.3.3 — **prepared in the repository; npm still serves 0.3.2** until it is published, so
  `npm i @hey-research-lab/sdk` installs 0.3.2. In 0.3.3 the walks (`pages()`, `items()`, `sync()`)
  pace their pages by the stated budget and wait out a temporary `429` by its `retry-after`, at most
  three times and never longer than 60 seconds (`rateLimit: { wait: 'walks' | 'always' | 'never' }`);
  a single call still throws unless `wait` is `'always'`, and a monthly `quota` is never waited for.
  `HeyApiError` carries the server's code (`apiCode`) and `requestId`. The types added on
  2026-10-17 (below) are in the package. In 0.3.2 nothing waits: every `429` throws a `HeyApiError`
  (`code: 'rate_limited'`, with `retryAfterSeconds`) for the caller to wait out.

- `GET /api/v1/builder`'s `404` for a contract HEY has not published carries `publishedNamesakes`
  (and the `text` and `md` forms its line) where a published project's token shares this token's
  name or ticker — the same shape and sentence as `/api/v1/scan`'s not-found card, so a partner bot
  asked about a copy can say which published project it imitates. Absent when none does.
- MCP (hosted and stdio): a slug HEY retired when its page was renamed or merged answers for the
  page it moved to, says so first in the text ("Resolved from the slug …"), and carries
  `resolvedFrom: { slug, to }` in `structuredContent` (`research_answer`: `subject.resolvedFrom.slug`).
  The hosted endpoint failed every such slug with an error naming its internal address.
- `GET /api/evidence/{id}` for a ship (additive): `countedAs` — `counted` (it counts itself),
  `counted_once_with` (one of a deploy run, a repository's release day, a code week or a prerelease
  week, which the score counts once; `countedWith: { id, group }` names the ship that stands for it)
  or `context` (it does not count; `countedAsReason` says why) — and `countedAsSentence`, the
  receipt's one sentence for it. About 3,000 receipts said a folded ship "does not count, it is
  context" when it had counted once with its group. `countsAsBuilding` keeps its meaning. MCP
  `get_evidence` prints the sentence.
- `GET /api/projects/{slug}/built-on`: the `definition` and side `sentence` say a code link is a
  reference — the project's own code names the other project's token — never "builds on"; a hook
  link keeps "builds on". Keys, counts and the edges the rules accept are unchanged.

### Fixed

- A bad key sent as `x-api-key` is told to remove that header; the `401` named the
  `authorization` header whichever one was sent.
- `GET /api/v1/builder`'s `last_code_activity.commits` and `active_days` are the newest code week's
  own counts — what its receipt (`/api/evidence/ship:<uuid>`, `codeWeek.commits`) says — not the
  whole read window behind the week's summary (up to ninety days), which printed "8 commits" for a
  week whose receipt counted 3. `commits_partial` says the week's count is a floor; a week HEY holds
  no count for is `null`, never the window's figure. The fields keep their meaning: the week's count.
- MCP `get_changes` and `get_project_timeline`, and the `hey://changes/latest` and project timeline
  resources: a page over the 24 KB answer is asked for again with a smaller `limit` until it fits, so
  the cursor the text prints reads on from the last row shown. It printed the full page's cursor
  under a page cut on its rows, and an agent following it skipped the cut events — retractions
  included (16 of 100 on one live call). A page that still cannot fit prints no cursor.

## 2026-10-17 — New builders means builders

### Changed

- `GET /api/projects?tab=new-builders` lists projects published on HEY in the last 7 days **with a
  builder source HEY reads and at least one counted ship**, the most recent first ship first. Before,
  it listed every page published in the window: of 192 rows, 171 read "Activity unknown" with no
  builder source, under a name that promised builders. On 2026-10-18 the tab held 47 projects where
  the old population held 379. This is a truth repair, kept under its name by the founder's ruling;
  the old population is `tab=new-on-hey`. A partner polling `new-builders` for every new page should
  switch to `new-on-hey`.

### Added

- `tab=new-on-hey`: every project published on HEY in the last 7 days, builder or not, newest first —
  what `new-builders` listed before.
- `GET /api/projects/{slug}/built-on`: which builders a project builds on and which build on it,
  named in code or running on a hook, each link with its evidence. Never a partnership, never an
  on-chain interaction.
- `/api/changes`: `cursor=` continues any page in the mode that issued it; `ignoredParameters` names
  a parameter the ledger does not read. `/api/projects` reads `query` as `q` and names ignored
  parameters the same way.
- The agent contract sets cache-busters and campaign tags aside (`query.ignoredParameters`) instead
  of answering 400; `what_changed` carries `data.resume`; an ambiguous name lists up to eight
  candidates with ticker, activity and catalog status, and `error.candidatesTotal`.
- `/api/chain/accelerating`: `judged`, `notMeasured` and, for an empty list, `reason`.
- `underTheRadar` (`HELD`, `NOT_HELD` or `NOT_MEASURED` with its reason) on the dossier's `score` and
  the snapshot's `build`.

## 2026-10-16 — Today's words beside the stored ones

### Added

- Ships and timeline entries: `displayTitle` (a running code week in today's words; `title` is
  unchanged) and `codeWeek.complete`. Change upserts and evidence receipts: `summaryCurrent`.
- Market detail: `distribution.figuresWithheld`, `pools`; `marketStatusLabel`, `distribution.stale`
  and `tvlRead` on the token market; `tokenMarket.label` on project cards.
- Scores: `cohortEvaluatedAt`; the Still Building withheld reason `no_tracked_high`.

### Changed

- `/api/changes` without a cursor (or with `before`) is newest first by each event's first arrival,
  so a revised old event never leads; `after` and `detectedSince` keep ledger order.
