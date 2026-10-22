-- Reiseplaner (/reise). Kjør hele filen i Supabase → SQL Editor.
-- Trygg å kjøre på nytt.

create extension if not exists pgcrypto;

-- Admin-tilgang -----------------------------------------------------------

create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
insert into public.admins (email) values ('mail@magnusheide.no') on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- Produkter / bibliotek (gjenbrukbare elementer med eller uten pris) ------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  track text not null default 'experience' check (track in ('stay', 'experience')),
  title text not null,
  description text not null default '',
  location text not null default '',
  contact text not null default '',
  links jsonb not null default '[]',
  price numeric(12, 2),
  price_unit text not null default 'per gruppe',
  created_at timestamptz not null default now()
);

-- Reiser ------------------------------------------------------------------

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]{4,64}$'),
  title text not null default 'Ny reise',
  client_name text not null default '',
  intro text not null default '',
  admin_notes text not null default '',
  start_date date,
  end_date date,
  currency text not null default 'NOK',
  status text not null default 'draft' check (status in ('draft', 'shared', 'confirmed', 'archived')),
  guest_message text not null default '',
  guest_submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  product_id uuid references public.products on delete set null,
  track text not null default 'experience' check (track in ('stay', 'experience')),
  date date,                    -- null = uten dato
  nights int,                   -- kun overnatting
  time text not null default '',
  title text not null,
  description text not null default '',
  location text not null default '',
  contact text not null default '',
  links jsonb not null default '[]',
  price numeric(12, 2),
  price_unit text not null default 'per gruppe',
  quantity numeric(10, 2) not null default 1,
  ask_guest boolean not null default false,   -- be gjesten om bekreftelse
  optional boolean not null default false,    -- tilleggsvalg (mersalg)
  guest_status text not null default 'pending'
    check (guest_status in ('pending', 'accepted', 'declined', 'question')),
  guest_comment text not null default '',
  guest_updated_at timestamptz,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists trip_items_trip_id_idx on public.trip_items (trip_id);

-- Ikon og fra/til-tid (lagt til senere)
alter table public.products add column if not exists icon text not null default '';
alter table public.trip_items add column if not exists icon text not null default '';
alter table public.trip_items add column if not exists end_time text not null default '';
alter table public.trip_items add column if not exists all_day boolean not null default false;

-- By/kategori per dato: {"2026-11-02": ["Oslo"], ...}
alter table public.trips add column if not exists day_labels jsonb not null default '{}';

-- Tilleggsvalg med valgmuligheter, og betalingsstatus
alter table public.trip_items add column if not exists options jsonb not null default '[]';
alter table public.trip_items add column if not exists guest_option text not null default '';
alter table public.trip_items add column if not exists paid boolean not null default false;
alter table public.trip_items add column if not exists refundable boolean not null default false;
alter table public.trip_items add column if not exists refundable_until date;

-- Tillegg som hører til et arrangement / en overnatting
alter table public.trip_items add column if not exists parent_id uuid references public.trip_items on delete cascade;

-- Bilder
alter table public.products add column if not exists image_url text not null default '';
alter table public.trip_items add column if not exists image_url text not null default '';

insert into storage.buckets (id, name, public) values ('reise-bilder', 'reise-bilder', true)
on conflict (id) do nothing;
drop policy if exists reise_bilder_admin_insert on storage.objects;
create policy reise_bilder_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reise-bilder' and public.is_admin());
drop policy if exists reise_bilder_admin_update on storage.objects;
create policy reise_bilder_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'reise-bilder' and public.is_admin());
drop policy if exists reise_bilder_admin_delete on storage.objects;
create policy reise_bilder_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reise-bilder' and public.is_admin());

-- RLS: kun admin har direkte tilgang. Gjester bruker funksjonene under. -----

alter table public.products enable row level security;
alter table public.trips enable row level security;
alter table public.trip_items enable row level security;

drop policy if exists admin_all on public.products;
create policy admin_all on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.trips;
create policy admin_all on public.trips for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.trip_items;
create policy admin_all on public.trip_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Gjeste-API (koden i URL-en fungerer som nøkkel) --------------------------

create or replace function public.get_trip_by_code(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trip', to_jsonb(t) - 'id' - 'admin_notes',
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) - 'trip_id' - 'product_id' order by i.date nulls last, i.time, i.sort)
      from trip_items i where i.trip_id = t.id
    ), '[]'::jsonb)
  )
  from trips t
  where t.code = lower(p_code)
    and (t.status in ('shared', 'confirmed') or public.is_admin());
$$;

drop function if exists public.guest_respond(text, uuid, text, text);
create or replace function public.guest_respond(
  p_code text, p_item_id uuid, p_status text, p_comment text, p_option text default ''
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pending', 'accepted', 'declined', 'question') then
    raise exception 'Ugyldig status';
  end if;
  update trip_items i
     set guest_status = p_status,
         guest_comment = left(coalesce(p_comment, ''), 2000),
         guest_option = case when p_status = 'accepted' then coalesce(p_option, '') else '' end,
         guest_updated_at = now()
    from trips t
   where i.id = p_item_id and i.trip_id = t.id
     and t.code = lower(p_code) and t.status = 'shared'
     and (i.ask_guest or i.optional)
     and (coalesce(p_option, '') = ''
          or (i.optional and i.options @> jsonb_build_array(jsonb_build_object('id', p_option))));
  if not found then
    raise exception 'Kan ikke oppdatere dette punktet';
  end if;
end;
$$;

create or replace function public.guest_submit(p_code text, p_message text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  ts timestamptz := now();
begin
  update trips
     set guest_message = left(coalesce(p_message, ''), 5000),
         guest_submitted_at = ts
   where code = lower(p_code) and status = 'shared';
  if not found then
    raise exception 'Kan ikke sende svar for denne reisen';
  end if;
  return ts;
end;
$$;

-- Keepalive: kalles ukentlig fra GitHub Actions så prosjektet ikke pauses. --

create table if not exists public.keepalive (
  id int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now()
);
alter table public.keepalive enable row level security;

create or replace function public.keepalive() returns timestamptz
language sql security definer set search_path = public as $$
  insert into keepalive (id, pinged_at) values (1, now())
  on conflict (id) do update set pinged_at = excluded.pinged_at
  returning pinged_at;
$$;

grant execute on function public.get_trip_by_code(text) to anon, authenticated;
grant execute on function public.guest_respond(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.guest_submit(text, text) to anon, authenticated;
grant execute on function public.keepalive() to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
