create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('affiliate', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum ('new', 'contacted', 'signed', 'tier_1_paid', 'tier_2_paid');
  end if;
end $$;

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
begin
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1
      from public.profiles
      where referral_code = candidate
    );
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
  constraint affiliate_requires_code check (
    role = 'admin' or referral_code is not null
  )
);

create table if not exists public.affiliate_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  phone text,
  referral_code text unique,
  invited_by uuid references public.profiles (id) on delete restrict,
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
  status public.lead_status not null default 'new',
  submitted_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists leads_affiliate_id_idx on public.leads (affiliate_id);
create index if not exists leads_status_idx on public.leads (status);
create unique index if not exists profiles_referral_code_idx on public.profiles (referral_code) where referral_code is not null;
create unique index if not exists affiliate_invites_referral_code_idx on public.affiliate_invites (referral_code) where referral_code is not null;

create or replace function public.normalize_affiliate_invite()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  new.referral_code := upper(regexp_replace(coalesce(new.referral_code, public.generate_referral_code()), '\s+', '', 'g'));
  return new;
end;
$$;

create or replace function public.normalize_profile()
returns trigger
language plpgsql
as $$
begin
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
    new.status := 'new';
  end if;

  if new.submitted_at is null then
    new.submitted_at := timezone('utc', now());
  end if;

  new.updated_at := timezone('utc', now());
  return new;
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
begin
  select *
  into invite_record
  from public.affiliate_invites
  where email = lower(new.email)
    and accepted_at is null
  limit 1;

  if invite_record.id is null then
    raise exception 'This email is not authorized for affiliate creation.';
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
  set accepted_at = timezone('utc', now()), updated_at = timezone('utc', now())
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

comment on table public.profiles is 'Authenticated users map 1:1 to affiliate or admin profiles.';
comment on table public.affiliate_invites is 'Admin-created affiliate invite records. Only invited emails may become affiliate auth users.';
comment on table public.leads is 'Public lead intake plus admin-managed payout milestone tracking.';
comment on function public.handle_new_user() is 'Creates an affiliate profile only when a matching admin-generated invite exists. Promote admins manually in profiles.';
