-- Home page: tracker reservations (a call-back request; no payment, no account).
-- Not granted to winou_app and not org-scoped: only the system connection writes or reads it.
create table reservations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  vehicle_type text not null check (vehicle_type in ('car', 'moto', 'scooter', 'several')),
  city text check (city is null or char_length(city) <= 80),
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);
create index reservations_phone_idx on reservations(phone, created_at desc);
create index reservations_created_idx on reservations(created_at desc);
alter table reservations enable row level security;
