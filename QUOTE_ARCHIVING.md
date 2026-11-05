# Quotation archiving

Quotes now follow the Products archive/restore pattern. The default list shows active quotes; **Show archived quotes** includes active and archived records. Archived cards show **Archived** and **Restore**, remain searchable by quote number/client/group, and retain View and Print / Save as PDF. Archiving requires confirmation. Successful archive/restore updates local list state immediately; errors leave the quote unchanged, and duplicate requests are blocked while processing.

Archiving is independent of Draft/Issued status. Archived drafts must be restored before editing. Issued quotes stay read-only even after restoration. PDFs and saved quote content are unchanged by archiving.

## Database and security

`supabase/amper_besig_quote_archiving.sql` adds `is_archived boolean not null default false`, so every existing quote remains active automatically. The authenticated `set_crm_quote_archived(uuid, boolean)` RPC locks the header row and changes **only** that flag. It does not change timestamps, numbers, client/product snapshots, totals, VAT, notes, overview, expiry, status or quote items. Explicit target states are idempotent.

Archive permissions match the existing authenticated-team quote read/save model; this feature does not introduce manager-only restrictions. Anonymous execution and calls without an authenticated user ID are rejected. No direct table UPDATE/DELETE permission or RLS policy is added or changed.

A small update trigger prevents archived quote content from being edited through either existing save RPC, including stale editors. Restore is the only allowed header update on an archived quote. The financial/proposal save functions and all calculations remain unchanged. Row locks serialize saves and archive/restore operations.

## Manual deployment order

1. Review the PR and back up the intended Supabase database. Test against staging with the existing quotation/VAT/proposal migrations installed.
2. **Before releasing the frontend**, manually run the complete `supabase/amper_besig_quote_archiving.sql` file in Supabase SQL Editor. It is transactional and repeatable; rerunning it does not reactivate archived records. Do not rerun old production migrations as a replacement. No production SQL was executed during development.
3. Allow the included `NOTIFY pgrst, 'reload schema'` to refresh API metadata. If needed, send that notification again and wait for schema reload.
4. Deploy the reviewed frontend and refresh existing tabs. No new Netlify variables, build settings or paid services are required.
5. Verify existing quotes remain active, archive a test draft after confirmation, enable Show archived quotes, view/print it, restore it and save it. Repeat with an issued quote and confirm Edit stays disabled after restoration. Verify archive/restore leaves all original fields and item snapshots intact.

Old frontend versions remain compatible with normal active-quote saves, but do not filter archived records. Refresh old tabs after deployment; if they try to save an archived draft, the database rejects the edit until restoration. A frontend-only rollback will similarly show archived records and retain the database's restore-before-edit protection. Do not remove records to roll back visibility.

## Validation

```sh
npm test
npm run build
bash tests/run-database-tests.sh
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
# With Vite running, in another terminal:
python tests/quote-archiving.browser.test.py
python tests/browser.test.py
```

The disposable PostgreSQL runner exercises the previous financial/QC/proposal suites, applies the archive migration repeatedly, and checks existing active defaults, draft/issued archiving/restoration, complete header/item snapshot equality, RPC authorization, unchanged RLS/table grants, archived edit rejection, post-restore saves and preservation of archived flags on migration rerun.

The focused browser suite checks cancellation, archive/restore errors, duplicate suppression, immediate filtering, both checkbox states, number/client/group search, reload persistence, disabled archived/issued editing, and identical PDF text before and after archiving. The existing browser suite continues checking other modules, VAT, proposal fields and long branded PDFs. Browser tests use the existing intercepted Supabase fixture; live Supabase/Netlify rollout needs the staging checks above.
