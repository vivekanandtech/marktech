# Marktech Cross-Channel Truth Layer — Phase Plan & Progress

## Why this initiative exists

Ad platforms over-report their own performance. A trustworthy analytics product has to treat **Shopify revenue as ground truth** and everything Meta/Google self-report as directional at best. This initiative grafts that philosophy onto the existing Marktech platform — real cross-channel attribution, new "truth" metrics, and a cross-channel insights engine — without a visual redesign (explicitly deferred) and without replacing the current architecture.

Live proof this matters: on the test account, Meta *claims* ₹3.66 Cr in reported revenue. Shopify actually banked ₹36.8 L. That's a **9.9× over-claim** — exactly the kind of number a CMO needs to see and currently can't.

---

## Phase 0 — Attribution spike ✅ Done

**Goal:** Find out whether Shopify orders can actually be traced back to which ad channel drove them, since almost everything else depends on this.

**Outcome:** Yes — via ShopifyQL:
```
FROM sales SHOW orders, total_sales
GROUP BY referring_channel, utm_medium, utm_source WITH LAST_CLICK_ATTRIBUTION
SINCE -Nd UNTIL today
```
No new Shopify scope or approval needed. Classification rule worked out from real data: a Meta-attributed order needs `referring_channel` in (facebook/instagram/c2c) **and** a populated `utm_medium` — organic Instagram/Facebook clicks share the same channel value as paid ones but carry no campaign tag.

---

## Phase 1 — Shopify service primitives ✅ Done

New backend functions (`packages/api/src/services/shopify.ts`):
- `getOrdersByChannel` — real per-channel order/revenue totals
- `getMetaSessions` — Shopify sessions attributed to Meta via UTM (replaces "Reach")
- `getSalesByCountry` / `getAvailableCountries` — real country breakdown (replaces the India/Intl toggle)
- `getNewCustomerCount` — sampled from the Orders API (needed a new `read_customers` scope, added)

---

## Phase 2 — Cross-channel metrics engine ✅ Done

One backend service (`metrics-engine.ts`) computes every truth metric **once**, so Overview, Reconciliation, and Insights can never disagree with each other: MER, Attributed CPR, nCAC, blended spend, platform over-claim — each with a current period, a previous period, and a % delta. Cached 10 minutes per client/date-range/country.

---

## Phase 3 — Overview page rebuild ✅ Done

- **Reach → Sessions** (Shopify sessions attributed to Meta)
- **Avg CPA → Attributed CPR** (Meta spend ÷ real Shopify orders, not Meta's self-reported conversions)
- New tiles: **MER**, **New-Customer CAC**, **Platform Over-claim**
- Real **country dropdown** replacing the "All / India / Intl" toggle
- "Channel & Market Split" card now shows real Meta vs. Google spend and real top-countries-by-revenue, instead of hardcoded percentages

Verified live in-browser with real data, zero console errors.

---

## Phase 4 — Trend-per-cell + Meta/Google table unification ✅ Done

- Removed the dead "Trend" column (was hardcoded to `0` for every row) from the Meta campaign/ad-set/ad table
- Every metric (Spend, ROAS, CTR, CPA) now shows its **own** trend inline, computed against the immediately-preceding period of equal length
- **Google Ads migrated onto the same shared table component Meta uses** — was a separate, hand-rolled tree with no trend and no platform icon; now one implementation for both, with Google getting trend-per-cell for free

**Two real bugs found and fixed along the way (unrelated to this refactor, just surfaced by testing it):**
- Google Ads API **v21 was sunset August 5, 2026** — every Google Ads call had been silently dead for three weeks. Bumped to v25.
- A wrong Google Ads Customer ID had been entered on reconnect — corrected by cross-checking against Google's own accessible-accounts list.

Verified live for both Meta and Google with real campaign data.

---

## Shopify table pagination ✅ Done (fixed alongside Phase 4)

"Sales by Hour" was silently rendering up to 1,000+ rows in one unpaginated table. Added client-side pagination (10 rows/page, Previous/Next, "Showing X–Y of Z") to both Shopify report tables. Verified live.

---

## Phase 5 — Semantic metrics layer (Inspect drawer) 🚧 In progress

**Goal:** Click any trust-critical metric tile → see its exact definition, formula, data sources, refresh cadence, and caveats. This is the "show your work" layer that makes a CMO trust the numbers instead of taking them on faith.

- Backend metric registry + `GET /api/metrics/definitions` — done
- Frontend `MetricInspectDrawer` component — in progress
- Wiring into MER / Attributed CPR / nCAC / Platform Over-claim tiles — pending
- Threshold-based color coding (good/watch/bad vs. targets) — pending

---

## Phase 6 — Reconciliation view ⏳ Not started

A dedicated page: platform-claimed revenue vs. Shopify-truth revenue, trended over time as an over-claim multiplier chart — the Phase 3 headline number, with history.

---

## Phase 7 — Insights engine v2 (the crux) ⏳ Not started

The biggest remaining phase. Upgrades the existing Meta-only AI insights panel into a genuine cross-channel engine: Meta + Google + Shopify truth metrics feed one LLM call, output is a ranked list (rank, category, evidence, expected impact, confidence, effort, "view evidence" link back to the source metric), persisted server-side, on its own dedicated page rather than a click-to-generate widget buried in Overview.

---

## Phase 8 — Cleanup & verification ⏳ Not started

Remove leftover `market` references, end-to-end test matrix across connection-state combinations (Meta-only, Meta+Shopify, all three), load-test the trend-per-cell change against a large account.

---

## Testing

Zero test infrastructure existed before this initiative. Vitest is now set up in both `packages/api` and `packages/dashboard` (`npm test` in either, or `npm run test --workspaces` from the root — which is what CI already calls, previously a silent no-op). **79 tests passing**, focused on the highest-risk logic: the metrics engine's math (with a regression test reproducing today's real 9.9× over-claim numbers), channel classification, date-window math, currency/number formatting, and the Meta/Google metric-transform logic.
