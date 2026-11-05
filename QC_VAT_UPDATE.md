# Onboarding LiveChat and quotation VAT update

This update adds LiveChat immediately after the existing Routing row, making 18 unique setup types. Partial outcomes and transfers retain their existing storage and permissions. The existing frontend counters derive from the setup-type list. The incremental trigger requires 18 reviewed outcomes on completion, including direct status writes. Completed historical onboarding tasks remain completed on unrelated edits; after reopening they must satisfy all 18 outcomes. Existing QC rows are not backfilled or deleted.

New and explicitly saved draft quotations apply 15% VAT **after** the rounded group discount, independently for setup and monthly pricing. Unit prices remain VAT-exclusive. `setup_total` and `monthly_total` retain their original meaning: discounted totals excluding VAT. New nullable header fields store `vat_rate`, `setup_vat`, `monthly_vat`, `setup_total_including_vat`, and `monthly_total_including_vat`. The server calculates these fields in the existing atomic, authenticated save RPC. No client totals are trusted. Header/item write rollback, issued-quote immutability, price snapshots, client snapshots, RLS and direct-write restrictions remain intact.

A null VAT snapshot identifies a legacy quotation. Merely viewing, printing, migrating, or deploying does not recalculate it. Its original totals and line prices remain visible with a historical VAT explanation. An editable historical draft shows a clear recalculation notice and current VAT in the builder; cancel leaves history alone, and an explicit save applies VAT while retaining original prices/client details/discount unless the user intentionally reselects the client. Saved previews use the stored VAT rate and totals, including after a future rate change.

Each cost section filters by its saved unit cost, so setup-only/monthly-only products appear in the appropriate section, both-cost products appear in both, and free products stay editable in the catalogue and product-selection table without adding customer cost rows. Empty cost sections show an explanation and zero totals. Preview and A4 printing share a final two-column summary after Notes. The summary stays in normal document flow and moves together to a new page when necessary.

## Manual Supabase and deployment order

Do not run production SQL automatically. Brandon should review the PR and perform these steps in the intended Supabase project:

1. Back up the database and test the upgrade in staging using the current production schema. Confirm the original feature migrations from `IMPLEMENTATION.md` are already installed. Do **not** rerun those original migrations on production to install this update.
2. Prepare the reviewed frontend build before the maintenance window. No new Netlify variables, paid services, build command, or publish directory are required. Keep `npm run build`, `dist`, and the existing public Supabase URL/anon key.
3. Pause quotation saves and onboarding status/QC changes during the coordinated deployment; have users close old tabs. This is necessary because the old frontend only reviews 17 QC types and only displays VAT-exclusive totals. The VAT migration keeps the RPC signature compatible, but old clients would not show the new VAT snapshots they save.
4. In Supabase SQL Editor, run **`supabase/amper_besig_quote_vat.sql` first**, before releasing the frontend. It adds nullable fields without backfilling history and replaces the save RPC with server-calculated VAT. Existing data remains readable by the old frontend, but quotation saves must stay paused until the new frontend is active.
5. Run **`supabase/amper_besig_qc_livechat.sql`** immediately before the coordinated frontend deployment. It expands only the setup CHECK constraint and the existing completion trigger function. Do not release the new frontend before this migration: the old CHECK constraint rejects LiveChat. Do not leave old clients active after this migration: 17-outcome completion requests are rejected.
6. Each migration is transactional/repeatable and requests PostgREST schema reload. If the API still has stale schema metadata, run `NOTIFY pgrst, 'reload schema';` and wait for the cache refresh. Confirm the five VAT columns, unchanged RLS policies/grants, LiveChat constraint, and completion trigger in staging.
7. Deploy the reviewed frontend on Netlify, then reopen/refresh browser tabs and resume writes. Test LiveChat Completed/Not Acquired and partial reopen, transfer QC, reject 17/18 completion, accept 18/18, and confirm historical completed tasks still permit unrelated edits.
8. Verify a legacy issued quote still shows its original totals, disabled Edit, and the historical VAT explanation. Save a test draft/new quotation with R1,500 setup / R750 monthly and a 10% group discount: exclusive totals R1,350 / R675; VAT R202.50 / R101.25; final totals R1,552.50 / R776.25. Verify setup-only, monthly-only and free products, then print a short and a long quotation.

A frontend-only rollback is insufficient after tightening QC and enabling VAT saves. Keep writes paused and review a coordinated database/frontend rollback or forward fix. Never remove saved VAT snapshots or reduce history to restore the old UI.

## Rate configuration and financial rounding

`src/money.js` exports `VAT_RATE` for draft previews; `public.crm_quote_vat_rate()` is the single server-side rate used on every new/explicit draft save. To change the rate in future, add an incremental migration updating that function and coordinate the matching frontend constant. Existing saved quotes read their own `vat_rate` and persisted amounts. Do not change existing snapshot rows. No environment variable is needed.

The frontend uses BigInt cents and four-decimal percentage units; PostgreSQL uses numeric. Each line is rounded half-up to cents, the percentage discount is rounded to cents, then VAT is rounded to cents on the discounted amount. Inclusive columns have additional integer capacity without changing existing exclusive columns. The new constraint permits either a wholly null historical snapshot or a complete, mathematically consistent VAT snapshot.

## Validation

From `/workspace/developer-message-builder`:

```sh
npm ci --no-audit --no-fund
npm test
npm run build
VITE_SUPABASE_URL=https://local-test.supabase.co VITE_SUPABASE_ANON_KEY=local-browser-test-key npm run build
bash tests/run-database-tests.sh
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
# In another terminal:
python tests/browser.test.py
```

`npm install --no-audit --no-fund` was also verified and left the lockfile unchanged; `npm ci` remains the repeatable installation command. Domain tests cover 18 unique rows, legacy QC behavior, decimal rounding, VAT after discount, 0%/100%, zeros and future rates. The Docker runner seeds real legacy records using the original schema/RPC **before** applying both incremental migrations twice. Database assertions cover history preservation, explicit legacy draft conversion, direct completion guards, LiveChat outcomes, transfers/RLS, server amounts, atomic rollback and issued immutability. Never run the test bootstrap/fixtures against Supabase.

Browser tests require Python Playwright, `/usr/bin/chromium`, and PyMuPDF (`fitz`) for PDF artifact assertions. They replace the Supabase module with an in-memory fixture and exercise the React UI; the independent PostgreSQL suite validates the actual SQL. Browser checks cover partial LiveChat selections, 18/18 counters, original features/navigation, mixed/free costs in builder/unsaved/saved previews, prior-rate and legacy issued previews, explicit legacy draft saves, print styling, and multi-page A4 artifacts with aligned final totals together on the final page.

Live Supabase Auth, production schema, realtime delivery, and Netlify deployment need Brandon's staging/release checks. Local tests do not assert those services have been validated. Existing Node module-type and Vite configuration warnings remain unrelated to this update.
