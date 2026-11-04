-- Milestone 1: accounts, organizations, vehicles, devices, audit log.
-- Tenant tables carry org_id and are protected by Row-Level Security (see bottom).

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  name text not null,
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  password_changed_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('personal', 'business')),
  timezone text not null default 'Africa/Tunis',
  location_retention_days integer not null default 90 check (location_retention_days between 7 and 365),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('owner', 'manager', 'viewer')),
  token_hash text not null unique,
  invited_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on invitations(org_id);

create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  family_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by uuid,
  user_agent text,
  created_at timestamptz not null default now()
);
create index refresh_tokens_user_idx on refresh_tokens(user_id);
create index refresh_tokens_family_idx on refresh_tokens(family_id);

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Placeholder: document keys/versions are defined once legal texts exist (docs/LEGAL_REVIEW.md).
create table consents (
  user_id uuid not null references users(id) on delete cascade,
  document_key text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, document_key, version)
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in ('car', 'motorcycle', 'scooter')),
  name text not null,
  make text,
  model text,
  color text,
  plate text not null,
  plate_format text not null check (plate_format in ('tn_standard', 'tn_rs', 'other')),
  speed_limit_kmh integer check (speed_limit_kmh between 10 and 250),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index vehicles_plate_active_uq on vehicles(org_id, plate) where archived_at is null;

create table devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  imei text not null check (imei ~ '^[0-9]{15}$'),
  label text,
  model text,
  protocol text,
  gateway_ref text,
  last_seen_at timestamptz,
  battery_pct smallint check (battery_pct between 0 and 100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
-- An IMEI can be active in only one organization at a time.
create unique index devices_imei_active_uq on devices(imei) where archived_at is null;

-- History of which device was in which vehicle. Composite FKs make cross-org links impossible.
create table device_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  device_id uuid not null,
  vehicle_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references users(id) on delete set null,
  foreign key (org_id, device_id) references devices(org_id, id) on delete cascade,
  foreign key (org_id, vehicle_id) references vehicles(org_id, id) on delete cascade
);
create unique index device_assignments_device_active_uq on device_assignments(device_id) where ended_at is null;
create unique index device_assignments_vehicle_active_uq on device_assignments(vehicle_id) where ended_at is null;

create table audit_log (
  id bigint generated always as identity primary key,
  org_id uuid references organizations(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  at timestamptz not null default now()
);
create index audit_log_org_at_idx on audit_log(org_id, at desc);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Org-scoped requests run as role winou_app with app.org_id set for the transaction.
-- System tasks (sign-in, migrations) run as the connection owner, which bypasses RLS.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'winou_app') then
    create role winou_app nologin;
  end if;
end $$;

create function current_org_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

grant usage on schema public to winou_app;
grant select on users to winou_app;
grant select, update on organizations to winou_app;
grant select, insert, update, delete on memberships, invitations, vehicles, devices, device_assignments to winou_app;
-- Audit log is append-only for the application.
grant select, insert on audit_log to winou_app;

alter table organizations enable row level security;
create policy tenant_isolation on organizations using (id = current_org_id()) with check (id = current_org_id());

alter table memberships enable row level security;
create policy tenant_isolation on memberships using (org_id = current_org_id()) with check (org_id = current_org_id());
alter table invitations enable row level security;
create policy tenant_isolation on invitations using (org_id = current_org_id()) with check (org_id = current_org_id());
alter table vehicles enable row level security;
create policy tenant_isolation on vehicles using (org_id = current_org_id()) with check (org_id = current_org_id());
alter table devices enable row level security;
create policy tenant_isolation on devices using (org_id = current_org_id()) with check (org_id = current_org_id());
alter table device_assignments enable row level security;
create policy tenant_isolation on device_assignments using (org_id = current_org_id()) with check (org_id = current_org_id());
alter table audit_log enable row level security;
create policy tenant_isolation on audit_log using (org_id = current_org_id()) with check (org_id = current_org_id());
