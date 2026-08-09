# Braids

Braids is a creative AI studio currently delivered as a static front end with authentication provided by Supabase.

## Run locally

From the repository root:

```sh
python3 -m http.server 4176 --bind 127.0.0.1
```

Open `http://127.0.0.1:4176/studio/`.

## Authentication

- Project: `creative-ai-studio`
- Supabase project reference: `xvnfxnnvckglvddpvmqj`
- Client configuration: `assets/supabase-config.js`
- Authentication behavior: `assets/auth.js`
- Protected pages use `data-auth-required="true"` on the `<body>`.

The publishable key in the browser is intentionally public. Never put a Supabase secret/service-role key or an AI provider API key in client-side files.

Before production email confirmation and password reset, configure Supabase Authentication URL settings:

- Site URL: `https://studio.brunomelicio.com`
- Redirect URLs:
  - `https://studio.brunomelicio.com/login.html`
  - `https://studio.brunomelicio.com/reset-password.html`
  - `http://127.0.0.1:4176/studio/login.html`
  - `http://127.0.0.1:4176/studio/reset-password.html`

## Accounts and administration

Working now:

- Email/password registration, confirmation, login and reset flows
- Verified protected routes and persistent sessions
- Editable creator profiles in `public.profiles`
- Email and password changes
- Global sign-out and self-service account deletion
- Admin-only account listing, search, role changes, suspension and deletion
- RLS-protected profile data and server-side administrative Edge Functions

The first account created with `brunomelicio.ai@gmail.com` receives the administrator role automatically. Confirm that email and log in; **Admin dashboard** will then appear in the account menu. All later role changes are made from that dashboard. Authorization is stored in protected Auth `app_metadata`, never in user-editable profile fields.

Relevant files:

- Profile UI: `profile.html`
- Admin UI: `admin.html`
- Account behavior: `assets/account.js`
- Database migration: `supabase/migrations/20260808000000_braids_user_profiles_and_admin_roles.sql`
- Edge Functions: `supabase/functions/admin-users` and `supabase/functions/delete-account`

## Current product scope

UI-only for now: model generation, uploads, gallery persistence, purchases, usage metering, and billing. These require server-side functions so provider keys and payment logic never reach the browser.
