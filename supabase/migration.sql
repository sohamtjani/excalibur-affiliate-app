create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('affiliate', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum ('lead', 'contacted', 'closed');
  end if;
end $$;

alter type public.lead_status add value if not exists 'lead';
alter type public.lead_status add value if not exists 'contacted';
alter type public.lead_status add value if not exists 'closed';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  profile_taken boolean;
  invite_taken boolean;
begin
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    execute 'select exists (select 1 from public.profiles where referral_code = $1)'
      into profile_taken
      using candidate;

    if to_regclass('public.affiliate_invites') is not null then
      execute 'select exists (select 1 from public.affiliate_invites where referral_code = $1)'
        into invite_taken
        using candidate;
    else
      invite_taken := false;
    end if;

    exit when not profile_taken and not invite_taken;
  end loop;

  return candidate;
end;
$$;

create or replace function public.generate_access_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  invite_taken boolean;
begin
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    if to_regclass('public.affiliate_invites') is not null then
      execute 'select exists (select 1 from public.affiliate_invites where access_code = $1)'
        into invite_taken
        using candidate;
    else
      invite_taken := false;
    end if;

    exit when not invite_taken;
  end loop;

  return candidate;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'affiliate',
  is_admin boolean generated always as (role = 'admin') stored,
  is_active boolean not null default true,
  name text not null default '',
  referral_code text unique,
  contact_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint affiliate_requires_code check (role = 'admin' or referral_code is not null)
);

create table if not exists public.affiliate_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  phone text,
  referral_code text unique,
  access_code text not null unique,
  invited_by uuid references public.profiles (id) on delete restrict,
  activation_nonce text,
  activation_issued_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  contact_info jsonb not null default '{}'::jsonb,
  notes text,
  affiliate_id uuid references public.profiles (id) on delete set null,
  submitted_referral_code text,
  status public.lead_status not null default 'lead',
  submitted_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  payout_timeline_days integer not null default 30,
  tier_1_due_at timestamptz,
  tier_1_paid_at timestamptz,
  tier_2_due_at timestamptz,
  tier_2_paid_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint lead_payout_timeline_days_check check (payout_timeline_days in (30, 60))
);

alter table public.profiles
  add column if not exists role public.app_role not null default 'affiliate',
  add column if not exists is_active boolean not null default true,
  add column if not exists name text not null default '',
  add column if not exists referral_code text,
  add column if not exists contact_info jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.affiliate_invites
  add column if not exists email text,
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists referral_code text,
  add column if not exists access_code text,
  add column if not exists invited_by uuid references public.profiles (id) on delete restrict,
  add column if not exists activation_nonce text,
  add column if not exists activation_issued_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.leads
  add column if not exists business_name text,
  add column if not exists contact_name text,
  add column if not exists contact_info jsonb not null default '{}'::jsonb,
  add column if not exists notes text,
  add column if not exists affiliate_id uuid references public.profiles (id) on delete set null,
  add column if not exists submitted_referral_code text,
  add column if not exists status public.lead_status not null default 'lead',
  add column if not exists submitted_at timestamptz not null default timezone('utc', now()),
  add column if not exists closed_at timestamptz,
  add column if not exists payout_timeline_days integer not null default 30,
  add column if not exists tier_1_due_at timestamptz,
  add column if not exists tier_1_paid_at timestamptz,
  add column if not exists tier_2_due_at timestamptz,
  add column if not exists tier_2_paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'profiles_referral_code_idx'
  ) then
    create unique index profiles_referral_code_idx
      on public.profiles (referral_code)
      where referral_code is not null;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'affiliate_invites_referral_code_idx'
  ) then
    create unique index affiliate_invites_referral_code_idx
      on public.affiliate_invites (referral_code)
      where referral_code is not null;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'affiliate_invites_access_code_idx'
  ) then
    create unique index affiliate_invites_access_code_idx
      on public.affiliate_invites (access_code);
  end if;
end $$;

create index if not exists leads_affiliate_id_idx on public.leads (affiliate_id);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_tier_1_due_at_idx on public.leads (tier_1_due_at);
create index if not exists leads_tier_2_due_at_idx on public.leads (tier_2_due_at);

create or replace function public.normalize_affiliate_invite()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  new.name := trim(new.name);
  new.phone := nullif(trim(coalesce(new.phone, '')), '');
  new.referral_code := upper(regexp_replace(coalesce(new.referral_code, public.generate_referral_code()), '\s+', '', 'g'));
  new.access_code := upper(regexp_replace(coalesce(new.access_code, public.generate_access_code()), '\s+', '', 'g'));
  return new;
end;
$$;

create or replace function public.normalize_profile()
returns trigger
language plpgsql
as $$
begin
  new.name := trim(coalesce(new.name, ''));

  if new.role = 'affiliate' then
    new.referral_code := upper(regexp_replace(coalesce(new.referral_code, public.generate_referral_code()), '\s+', '', 'g'));
  else
    new.referral_code := null;
  end if;

  return new;
end;
$$;

create or replace function public.assign_affiliate_from_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.submitted_referral_code := nullif(upper(regexp_replace(coalesce(new.submitted_referral_code, ''), '\s+', '', 'g')), '');

  if new.submitted_referral_code is not null then
    select p.id
    into new.affiliate_id
    from public.profiles p
    where p.referral_code = new.submitted_referral_code
      and p.role = 'affiliate'
      and p.is_active = true
    limit 1;
  end if;

  if new.status is null then
    new.status := 'lead';
  end if;

  if new.submitted_at is null then
    new.submitted_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

create or replace function public.prepare_lead_payout_schedule()
returns trigger
language plpgsql
as $$
declare
  base_date timestamptz;
begin
  if new.status = 'signed' then
    new.status := 'closed';
  elsif new.status = 'new' then
    new.status := 'lead';
  elsif new.status in ('tier_1_paid', 'tier_2_paid') then
    new.status := 'closed';
  end if;

  if new.payout_timeline_days is null then
    new.payout_timeline_days := 30;
  end if;

  if new.payout_timeline_days not in (30, 60) then
    raise exception 'payout_timeline_days must be 30 or 60';
  end if;

  if new.status = 'closed' and new.closed_at is null then
    new.closed_at := timezone('utc', now());
  end if;

  if new.closed_at is not null then
    base_date := new.closed_at;
    new.tier_1_due_at := base_date + make_interval(days => new.payout_timeline_days);
    new.tier_2_due_at := base_date + interval '6 months';
  end if;

  if new.tier_2_paid_at is not null and new.tier_1_paid_at is null then
    new.tier_1_paid_at := new.tier_2_paid_at;
  end if;

  return new;
end;
$$;

create or replace function public.verify_affiliate_access(email_input text, access_code_input text)
returns table (invite_name text, referral_code text, activation_nonce text)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  normalized_code text;
  generated_nonce text;
begin
  normalized_email := lower(trim(coalesce(email_input, '')));
  normalized_code := upper(regexp_replace(coalesce(access_code_input, ''), '\s+', '', 'g'));

  if normalized_email = '' or normalized_code = '' then
    raise exception 'Email and access code are required.';
  end if;

  generated_nonce := encode(gen_random_bytes(18), 'hex');

  update public.affiliate_invites
  set
    activation_nonce = generated_nonce,
    activation_issued_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where email = normalized_email
    and access_code = normalized_code
    and accepted_at is null;

  if not found then
    raise exception 'That email and access code do not match our records.';
  end if;

  return query
  select name, public.affiliate_invites.referral_code, generated_nonce
  from public.affiliate_invites
  where email = normalized_email
  limit 1;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.affiliate_invites%rowtype;
  provided_nonce text;
begin
  provided_nonce := coalesce(new.raw_user_meta_data ->> 'activation_nonce', '');

  select *
  into invite_record
  from public.affiliate_invites
  where email = lower(new.email)
    and accepted_at is null
  limit 1;

  if invite_record.id is null then
    raise exception 'This email is not authorized for affiliate creation.';
  end if;

  if coalesce(invite_record.activation_nonce, '') = '' then
    raise exception 'Verify your access code before creating your account.';
  end if;

  if provided_nonce = '' or provided_nonce <> invite_record.activation_nonce then
    raise exception 'Your verification session is invalid. Start again from the portal.';
  end if;

  if invite_record.activation_issued_at is null or invite_record.activation_issued_at < timezone('utc', now()) - interval '30 minutes' then
    raise exception 'Your verification window expired. Verify your access code again.';
  end if;

  insert into public.profiles (id, role, name, referral_code, contact_info)
  values (
    new.id,
    'affiliate',
    invite_record.name,
    invite_record.referral_code,
    jsonb_strip_nulls(
      jsonb_build_object(
        'email', new.email,
        'phone', invite_record.phone
      )
    )
  )
  on conflict (id) do update
  set
    name = excluded.name,
    referral_code = excluded.referral_code,
    contact_info = public.profiles.contact_info || excluded.contact_info,
    updated_at = timezone('utc', now());

  update public.affiliate_invites
  set
    accepted_at = timezone('utc', now()),
    activation_nonce = null,
    activation_issued_at = null,
    updated_at = timezone('utc', now())
  where id = invite_record.id;

  return new;
end;
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

drop trigger if exists profiles_normalize_before_write on public.profiles;
create trigger profiles_normalize_before_write
before insert or update on public.profiles
for each row
execute function public.normalize_profile();

drop trigger if exists affiliate_invites_normalize_before_write on public.affiliate_invites;
create trigger affiliate_invites_normalize_before_write
before insert or update on public.affiliate_invites
for each row
execute function public.normalize_affiliate_invite();

drop trigger if exists affiliate_invites_set_updated_at on public.affiliate_invites;
create trigger affiliate_invites_set_updated_at
before update on public.affiliate_invites
for each row
execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists leads_assign_affiliate_before_insert on public.leads;
create trigger leads_assign_affiliate_before_insert
before insert on public.leads
for each row
execute function public.assign_affiliate_from_referral_code();

drop trigger if exists leads_prepare_schedule_before_write on public.leads;
create trigger leads_prepare_schedule_before_write
before insert or update on public.leads
for each row
execute function public.prepare_lead_payout_schedule();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.affiliate_invites enable row level security;
alter table public.leads enable row level security;

drop policy if exists "public_insert_leads" on public.leads;
create policy "public_insert_leads"
on public.leads
for insert
to anon, authenticated
with check (true);

drop policy if exists "affiliate_select_own_leads" on public.leads;
create policy "affiliate_select_own_leads"
on public.leads
for select
to authenticated
using (affiliate_id = auth.uid());

drop policy if exists "admin_full_access_leads" on public.leads;
create policy "admin_full_access_leads"
on public.leads
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "affiliate_select_own_profile" on public.profiles;
create policy "affiliate_select_own_profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "admin_full_access_profiles" on public.profiles;
create policy "admin_full_access_profiles"
on public.profiles
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "admin_full_access_affiliate_invites" on public.affiliate_invites;
create policy "admin_full_access_affiliate_invites"
on public.affiliate_invites
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

revoke all on function public.verify_affiliate_access(text, text) from public;
grant execute on function public.verify_affiliate_access(text, text) to anon, authenticated;

comment on table public.profiles is 'Authenticated users mapped 1:1 to affiliate or admin profiles.';
comment on table public.affiliate_invites is 'Admin-created affiliate setup records. Affiliate accounts can only be created from these records.';
comment on table public.leads is 'Lead intake plus admin-managed close date and payout milestone tracking.';
comment on function public.verify_affiliate_access(text, text) is 'Checks invite email + access code and issues a short-lived activation nonce for account creation.';
comment on function public.handle_new_user() is 'Creates an affiliate profile only when a matching admin-created invite and activation nonce exist.';
