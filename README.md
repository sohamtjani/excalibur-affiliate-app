# Excalibur Affiliate App

React + Tailwind frontend for a Supabase-backed referral and affiliate portal with three roles:

- Public lead intake without login
- Affiliate dashboard with read-only access to owned leads and payout status
- Admin dashboard for affiliate and lead management

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
insert into public.affiliate_invites (email, name, referral_code)
values ('you@example.com', 'Your Name', 'EXCAL001');
```

5. Activate that invited account from the portal, then promote it to admin:

```sql
update public.profiles
set role = 'admin'
where id = 'YOUR_AUTH_USER_UUID';
```

6. After that, all future affiliates should be created only from the admin portal invite form.

## Security notes

- Public users can only `INSERT` into `leads`.
- Affiliates can only `SELECT` their own `leads` and their own `profile`.
- Admins get full CRUD on `profiles` and `leads` through RLS.
- New affiliate auth accounts are blocked unless a matching row exists in `affiliate_invites`.
- Public spam protection here is client-side only: schema validation, honeypot field, and local rate limiting. If you want hard server-side throttling later, add a Supabase Edge Function or CAPTCHA gateway in front of inserts.

## Business rules captured

- Lead pipeline: `new -> contacted -> signed -> tier_1_paid -> tier_2_paid`
- Tier 1 payout tracked at `$200`
- Tier 2 payout tracked as total earned of `$400`
- Total referral cap tracked at `$400`

The 30-day / 60-day timing rule is not automatically enforced from billing data in this version. Admins mark payout milestones when those conditions are met operationally.
