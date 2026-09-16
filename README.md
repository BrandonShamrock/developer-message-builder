# Amper Besig

Internal React app bringing together OpenAI developer message templates, dealer/client records, PostX Daily task management, and CRM client management, with groundwork for a future quote builder. The template builder intentionally does **not** integrate with the OpenAI API; it only generates developer message text for copying into the OpenAI dashboard.

## Features

- Supabase email/password authentication with protected app pages and logout.
- Dashboard with sidebar navigation.
- Template CRUD, duplication, and automatic `{{variable_name}}` detection saved to the `variables` field.
- Client CRUD for reusable client and brand metadata.
- Builder workflow that combines a selected template and client, auto-fills matching variables, requests manual values for missing fields, previews the final message, warns about missing values, copies to clipboard, and saves generated output.
- Generated message history with view, copy, and delete actions.
- A separate CRM module for searchable client records, reusable groups, and group discount defaults.
- Plain CSS responsive layout suitable for Netlify or GitHub Pages deployment.

## Tech Stack

- React
- Vite
- JavaScript
- Supabase Auth and Database
- Plain CSS

## Supabase Requirements

The app expects these existing Supabase tables:

1. `templates`
2. `clients`
3. `generated_messages`
4. `profiles`

The frontend uses only the public anon key. Never add service role keys or private credentials to this repository.

Expected fields used by the app include:

- `templates`: `id`, `name`, `category`, `description`, `template_body`, `variables`, `created_by`, `created_at`
- `clients`: `id`, `client_name`, `brand_name`, `organisation_name`, `contact_person`, `contact_email`, `contact_number`, `industry`, `brand_tone`, `preferred_language`, `website`, `notes`, `created_by`, `created_at`
- `generated_messages`: `id`, `template_id`, `client_id`, `final_message`, `variables_used`, `created_by`, `created_at`

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

3. Add your Supabase project values to `.env`:

   ```env
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```

4. Run locally:

   ```bash
   npm run dev
   ```

5. Build for production:

   ```bash
   npm run build
   ```

6. Preview the production build:

   ```bash
   npm run preview
   ```

## Deployment Notes

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify environment variables.

### GitHub Pages

- Build with `npm run build`.
- Deploy the `dist` directory using your preferred GitHub Pages workflow.
- If deploying to a subpath, configure Vite's `base` option in `vite.config.js` before building.
- Add environment variables as repository or workflow secrets and expose them during the build as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Security Notes

- This app uses `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`.
- Do not hardcode Supabase credentials.
- Do not add a Supabase service role key to frontend code.
- Configure Supabase Row Level Security policies to ensure users can only access the rows they are allowed to manage.

## PostX Daily Setup

PostX Daily adds date-based To Do, carried-over WIP, completed-task history, progress comments, manager team views, and printable PDF reports. Before using it, run [`supabase/postx_daily_schema.sql`](supabase/postx_daily_schema.sql) in the Supabase SQL editor. The script adds the task/comment tables, indexes, timestamps, profile role fields, and Row Level Security policies. It never requires a service-role key in the browser.

### Assign team roles

After replacing the placeholder emails with the exact Supabase Auth emails, run:

```sql
update public.profiles
set role = 'manager', full_name = 'Brandon'
where email = 'BRANDON_EMAIL_HERE';

update public.profiles
set role = 'agent', full_name = 'Jamie'
where email = 'JAMIE_EMAIL_HERE';

update public.profiles
set role = 'agent', full_name = 'Petunia'
where email = 'PETUNIA_EMAIL_HERE';
```

New users receive an `agent` profile when they first open PostX Daily if a profile does not already exist. Set managers manually: never let users assign their own manager role. Confirm every profile's `id` matches its user ID in **Authentication → Users**. Managers can then select any readable profile; agents remain restricted to their own records by both the UI and RLS.

### PDF reports

The export opens a print-optimised report in a new browser tab and opens the system print dialog. Choose **Save as PDF** as the printer destination. If the tab does not open, allow popups for the app's origin.

## CRM Setup

The CRM stores business and contact details, addresses, group membership, and numeric group discounts. It is deliberately separate from the existing `clients` table: that table continues to supply template/dealer variables to the message Builder, while `crm_clients` and `crm_groups` provide a clean data source for a future Quote Builder. The Quote Builder itself is not part of this release.

Manual Supabase setup is required:

1. Sign in to the Supabase dashboard for the app's project.
2. Open **SQL Editor**, choose **New query**, and paste the complete contents of [`supabase/crm_schema.sql`](supabase/crm_schema.sql).
3. Run the query and confirm that `crm_groups` and `crm_clients` appear in **Table Editor**.
4. Confirm Row Level Security is enabled on both tables, then sign in to the app and open **CRM**.

The SQL creates only new CRM tables, indexes, timestamp triggers, and authenticated-user policies. It does not modify the existing `clients` table or weaken policies on any existing feature. Version 1 permits any authenticated user to delete CRM records; restricting deletion to managers is a possible future hardening improvement.
