# Developer Message Builder

Internal dashboard for creating and managing OpenAI developer message templates.

## Purpose

This app allows the team to:

- Create and save developer message templates
- Add variables to templates using {{variable_name}}
- Create and save client/contact profiles
- Select a template and a client
- Auto-fill matching variables from the client profile
- Manually complete missing variables
- Preview the final developer message
- Copy the final developer message for use in the OpenAI dashboard
- Save generated messages for future reference

## Tech Stack

- React
- Supabase
- Supabase Auth
- Supabase Database
- GitHub Pages or Netlify for hosting

## Version 1 Scope

Version 1 should include:

- Login page
- Dashboard
- Templates page
- Clients page
- Builder page
- Generated message history page

## Important

Do not store private API keys in the frontend code.

Only use the Supabase public anon key in the frontend.

The Supabase service role key must never be added to this repository.
