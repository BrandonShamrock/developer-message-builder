# Branded PostX proposal PDF

The quotation preview and browser Print / Save as PDF now use the supplied `PostX_Quote_Template.html` design: embedded PostX/R-E-D/partner logos, cover, company overview, core values, terms, payment wording, service overview, costing, order confirmation, signatures and footer. The logos are bundled local assets and require no remote image requests. Feature lists are omitted as requested; product descriptions remain in each relevant pricing table.

The quote editor has an optional **Service overview** text area and **Expiry date** date picker. New quotes start with the supplied template's standard overview, which can be edited or cleared. Existing quotes receive no invented overview or expiry date. Both fields are saved atomically with the quotation and appear in unsaved previews and saved PDFs. Empty optional content is omitted, and missing client/address/contact values print blank without template tokens or stray separators. Addresses use the original saved full-address field. No new brand field is introduced; the saved business name supplies Dealer / Brand.

The print view continues to use saved line-item prices, discounts, VAT rates and totals. Each cost section includes subtotal, group discount, discount amount, discounted subtotal, VAT and VAT-inclusive total. A paired setup/monthly final summary stays together in print. Legacy quotes continue to show original totals and the historical VAT explanation. Already-issued quotes remain read-only, including the new fields.

## Manual release steps

1. Review and test in staging. Ensure the original quote migrations and `supabase/amper_besig_quote_vat.sql` are already installed.
2. In the intended Supabase SQL Editor, manually run **`supabase/amper_besig_quote_proposal.sql`** before deploying this frontend. Do not rerun or modify original production migrations. No production SQL was executed during development.
3. This additive, repeatable migration adds nullable `service_overview` and `valid_until` columns and a new authenticated `save_crm_quote_proposal` RPC. It composes the existing financial save and metadata update in one transaction. Existing `save_crm_quote` callers remain compatible and preserve metadata; no RLS policies or table grants change, and historical rows are not backfilled.
4. Wait for the requested PostgREST schema reload; if necessary run `NOTIFY pgrst, 'reload schema';` and retry. Then deploy the reviewed frontend and refresh tabs. **No new Netlify variables, build settings or paid services are required.**
5. In staging, create a draft, edit the overview and expiry, preview, save and reopen it. Verify both fields persist; clear them and confirm they disappear from print. Verify VAT after discount, zero-price filtering, legacy totals, and issued read-only behavior. Print both short and long A4 proposals with background graphics enabled and browser headers/footers disabled to match the supplied design.

The template's fixed company statistics, names, terms and contact information have been retained as supplied. They are document copy, not inferred customer data. Authorisation name/signature/date cells remain blank for manual signing. Custom overview/notes are rendered as escaped plain text with line breaks, never interpreted as HTML.

## Files and checks

- `src/QuoteDocument.jsx`, `src/quote-proposal.css`, `src/assets/quote/*`: scoped branded document and supplied logos.
- `src/QuoteCosts.jsx`: existing financial display extracted for reuse by builder and document; calculations remain in `money.js`.
- `src/Quotes.jsx`, `src/quoteProposal.js`: editable fields, save/preview wiring, default overview and Johannesburg date formatting. Printing waits for logos and fonts.
- `supabase/amper_besig_quote_proposal.sql`: incremental metadata persistence without changing the financial RPC signature.
- `tests/quote-proposal.test.sql`, updated domain/browser tests and database runner: persistence, blank clearing, auth, issued immutability, rollback on metadata failure, original RPC compatibility, VAT, dates, logos and PDF regressions.

Validation commands:

```sh
npm test
npm run build
VITE_SUPABASE_URL=https://local-test.supabase.co VITE_SUPABASE_ANON_KEY=local-browser-test-key npm run build
bash tests/run-database-tests.sh
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
# Separate terminal, while Vite is running:
python tests/browser.test.py
```

Database tests run only against a disposable PostgreSQL 17 container; both the old financial regressions and new proposal metadata tests are exercised. Browser tests use the intercepted Supabase fixture and Chromium, with PyMuPDF assertions on generated A4 PDFs. Live Supabase/staging deployment must still be verified during release. Existing Node module-type and Vite config warnings remain non-fatal.

Verified in this change: 12 unit tests, 9 browser test groups, both production build modes, and the complete database suites passed. Generated PDFs were also visually inspected, including the supplied logos, pricing/VAT tables, final totals and order confirmation/footer.
