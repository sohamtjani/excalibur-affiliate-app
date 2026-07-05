# Excalibur Affiliate App

React + Tailwind frontend for a Supabase-backed referral and affiliate portal with role-based access:

- Affiliate portal at `/` with code-verified account setup and read-only lead visibility
- Admin portal at `/admin` for affiliate setup, lead management, and payout reminders
- Shared Supabase backend with Auth, Postgres, and Row Level Security

## Stack

- React 19 + Vite
- Tailwind CSS
- Supabase Auth + Postgres + Row Level Security
- GitHub Pages static hosting

## Project structure

- `src/`: frontend application
- `supabase/migration.sql`: full SQL migration for tables, triggers, and RLS

## Required Supabase configuration

This app intentionally does not hardcode fake credentials.

Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Add your real Supabase values to a local `.env.local` for testing.
2. Build the app:

```bash
npm run build
```

3. Deploy the contents of `dist/` to your GitHub Pages branch or repository Pages root.

`vite.config.ts` uses `base: './'`, and the build copies `index.html` to `404.html` so browser-routed paths keep working on GitHub Pages.

## Supabase setup

1. Open the Supabase SQL editor.
2. Paste `supabase/migration.sql`.
3. Run it.
4. Seed the first invited email in SQL so account creation is allowed:

```sql
insert into public.affiliate_invites (email, name, referral_code, access_code)
values ('you@example.com', 'Your Name', 'EXCAL001', 'WELCOME123');
```

5. Activate that invited account from the portal, then promote it to admin:

```sql
update public.profiles
set role = 'admin'
where id = 'YOUR_AUTH_USER_UUID';
```

6. After that, all future affiliates should be created only from the admin portal at `/admin`.

## Security notes

- Public users can only `INSERT` into `leads`.
- Affiliates can only `SELECT` their own `leads` and their own `profile`.
- Admins get full CRUD on `profiles`, `leads`, and `affiliate_invites` through RLS.
- New affiliate auth accounts are blocked unless a matching admin-created invite exists and the affiliate has verified the correct access code first.
- Public spam protection here is client-side only: schema validation, honeypot field, and local rate limiting. If you want hard server-side throttling later, add a Supabase Edge Function or CAPTCHA gateway in front of inserts.

## Business rules captured

- Lead pipeline: `lead -> contacted -> closed`
- Admin closes the lead when a referral becomes a client
- Closing a lead starts the payout clock automatically
- Tier 1 payout due at `$200` after `30` days by default, or `60` days when that lead is set to the retainer-only timeline
- Tier 2 payout due at `$200` after `6 months`
- Total referral cap tracked at `$400`

The portal shows payout reminders when milestone dates are due. Admins still mark payouts manually after sending them.
