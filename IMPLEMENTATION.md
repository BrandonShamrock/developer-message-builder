# Ticket QC, appearance, products and quotes

For the subsequent LiveChat/18-item QC and quotation VAT release, follow [QC_VAT_UPDATE.md](QC_VAT_UPDATE.md). The original migration steps below describe the initial release only.

The feature branch adds to the existing React/Vite/Supabase application. Existing CRM, template Clients, authentication, task transfer RPC, notifications, timers and report logic remain in place. No production SQL is executed by the app or by this development task.

## Implemented modules

- PostX Daily: eight required categories, legacy `Other` fallback/backfill, badges and PDF category labels; all 18 QC setup types; mutually exclusive Completed/Not Acquired outcomes; partial saves, reviewed/outstanding counts, direct checklist access in To Do/WIP; completion guards on the card, editor and database. Task + QC saves are atomic. QC ownership follows the task, not the original author. Existing completed onboarding rows can retain their status on unrelated edits; reopening then recompleting requires full QC. Checklist rows are retained when changing category or transferring tasks.
- Appearance: gear beside the sidebar title, accessible native modal with focus containment and Escape; light/dark/system, five accents, four font sizes, live app preview, save/cancel/reset. User-specific Supabase preferences load on login and reset on logout. Kanban orange/blue/green status colours remain distinct.
- Products: searchable A–Z shared catalogue, create/edit modal, independent non-negative setup/monthly prices including zero, ZAR display, archive/restore. No product deletion is exposed or granted to the authenticated role.
- Quotes: searchable history, searchable CRM client/product selectors, multi-product selection, positive fractional quantities (up to three decimals), independent setup/monthly breakdowns and discounts. CRM groups are authoritative, with legacy client discount fallback. Decimal math uses scaled BigInt and PostgreSQL numeric, rounding each line and each discount half-up to two decimal places. Discounts are normalised to four decimal places. Save is one server transaction. Existing draft lines keep their price/description snapshots; reselecting a client intentionally refreshes its details and discount. Archived products remain in old quotes but cannot be added to new ones. Issued quotes are read-only. Preview and browser print/PDF use the saved snapshots, omit zero-price lines in every cost breakdown, and show saved VAT treatment with final totals aligned together after Notes.

## Manual Supabase steps — Brandon

1. Back up the production database using your existing Supabase backup process. Review these SQL files and the existing table definitions/policies in the intended project before running anything.
2. Confirm the previously deployed prerequisites are already installed: `supabase/postx_daily_schema.sql`, `postx_daily_kanban_update.sql`, `postx_daily_transfer_update.sql`, and `crm_schema.sql`. Do not blindly rerun older schema scripts on a newer database: the old transfer script backfills timers and the old base script changes policies. The new migrations assume the existing `daily_tasks`, `profiles`, `crm_clients` and `crm_groups` definitions in this repository.
3. In Supabase SQL Editor, manually run each complete new file in this order:
   1. `supabase/amper_besig_ticket_categories_qc.sql`
   2. `supabase/amper_besig_user_preferences.sql`
   3. `supabase/amper_besig_products.sql`
   4. `supabase/amper_besig_quotes.sql`
4. Each file is transactional and repeatable. The ticket migration adds `category`, fills only null/blank values with `Other`, then requires an explicit valid category for new rows. No existing task, CRM record, table or column is deleted. Unknown pre-existing nonblank categories deliberately cause the transaction to fail rather than silently changing them: review and map such values first.
5. Confirm RLS is enabled on all five new tables. Keep the existing manager role assignments in `profiles`. QC policies use `daily_tasks.owner_id` and the existing `is_manager()` function; preference policies use only `auth.uid()`, even for managers. Products are shared among authenticated users; quote tables are readable by the team but writable only through the authenticated `save_crm_quote` RPC, which validates and recalculates snapshots and totals.
6. Each new migration sends `NOTIFY pgrst, 'reload schema'`. If Supabase still reports a missing table/function, run `NOTIFY pgrst, 'reload schema';` in SQL Editor and retry after the cache refresh.
7. Test with two agent accounts and one manager in a staging project before production release: create/edit existing and new tasks, transfer onboarding tasks with partial QC, complete/reopen, test notifications, verify preference separation, and exercise products and saved/printed quotations.

Do not run `tests/database-bootstrap.sql` or `tests/database.test.sql` in Supabase. They are local disposable database fixtures, not deployment migrations.

## Netlify and release

No new Netlify variables, paid services or build settings are needed. Retain build command `npm run build`, publish directory `dist`, and the existing `VITE_SUPABASE_URL` and **public** `VITE_SUPABASE_ANON_KEY`. Never use a service-role key. Keep the feature branch out of production until the PR is reviewed and the migrations have been run. A Netlify deploy preview pointing at a production Supabase project can still write real records: use staging Supabase values for functional testing.

The new app requires the migrations before its task-save RPC and new features can work. The older deployed frontend does not submit a category; after applying the required-category migration it cannot create tasks. Coordinate the migration and reviewed frontend release in a maintenance window, or first prepare a separate compatibility release that submits categories. This migration does not silently default newly created tasks to Other because a category is required by the task specification.

## Checks and limitations

- `npm ci --no-audit --no-fund` installs the locked dependencies; `npm test` runs the focused QC/financial domain tests.
- `npm run build` validates the standard build. To compile the configured authenticated app without real credentials, use `VITE_SUPABASE_URL=https://local-test.supabase.co VITE_SUPABASE_ANON_KEY=local-browser-test-key npm run build`. Those are synthetic test settings, not deployment values.
- `bash tests/run-database-tests.sh` requires a working local Docker daemon. It creates a fresh PostgreSQL 17 container, models Supabase Auth roles/UID, applies the repository prerequisites, checks preservation of a legacy completed task, applies each new migration twice, then checks QC completion/RLS/transfers, preference isolation, quote arithmetic, snapshots and transactional failures. It destroys only its own container on exit.
- With `npm run dev -- --host 0.0.0.0 --port 5173 --strictPort` running, `python tests/browser.test.py` uses Python Playwright, Chromium and PyMuPDF to exercise the actual UI against an intercepted in-memory Supabase module. It checks error recovery, saved QC, appearance persistence, product/archive flows, quote calculations and PDF layout, existing module navigation and mobile settings. It never contacts a Supabase project. The local database tests separately exercise SQL enforcement.
- Live Supabase Auth, PostgREST, realtime notification delivery, actual cross-device preference syncing, the production schema and Netlify deployment are not tested here because project configuration/test accounts are absent. Existing module navigation is smoke-tested; the complete existing CRUD and realtime regression matrix still needs staging verification.
- New/explicitly saved drafts calculate 15% VAT after discount; legacy quotes retain their historical totals. Quotes have no emailing or paid PDF service. Drafts may be edited; issued quotes intentionally cannot be changed. Prices are bounded at R999,999,999.99; quantities at 999,999.999; per-period quote subtotals at R99,999,999,999.99; at most 200 lines per quote. These bounds keep JSON numeric round trips safe to cents. The current build emits the existing Vite config-module warning and Node reports the repository’s existing missing package module-type declaration during tests. Products and Quotes load on demand to keep the initial application bundle smaller.

## File map

New UI/helpers: `src/Appearance.jsx`, `Modal.jsx`, `Products.jsx`, `Quotes.jsx`, `money.js`, `qc.js`. Existing integration points: `src/main.jsx`, `PostXDaily.jsx`, `styles.css`. New deployment SQL: the four `supabase/amper_besig_*.sql` files above. Validation: `tests/domain.test.mjs`, `browser.test.py`, `browser-fixture.js`, `database-bootstrap.sql`, `database.test.sql`, `run-database-tests.sh`; `package.json` adds the test command. This document records deployment and verification steps.
