# Developer Message Builder

Internal React app for creating, saving, editing, deleting, reusing, previewing, copying, and storing OpenAI developer message templates. Version 1 intentionally does **not** integrate with the OpenAI API; it only generates developer message text for copying into the OpenAI dashboard.

## Features

- Supabase email/password authentication with protected app pages and logout.
- Dashboard with sidebar navigation.
- Template CRUD, duplication, and automatic `{{variable_name}}` detection saved to the `variables` field.
- Client CRUD for reusable client and brand metadata.
- Builder workflow that combines a selected template and client, auto-fills matching variables, requests manual values for missing fields, previews the final message, warns about missing values, copies to clipboard, and saves generated output.
- Generated message history with view, copy, and delete actions.
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
