-- Milestone 2: location data.
create extension if not exists postgis;

-- Every accepted GPS fix. Kept for organizations.location_retention_days, then deleted.
-- TODO(prod): monthly partitions so retention can drop whole partitions; plain table for now.
create table positions (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  device_id uuid not null,
  vehicle_id uuid,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  geom geography(Point, 4326) not null,
  speed_kmh real not null default 0 check (speed_kmh >= 0 and speed_kmh < 400),
  heading smallint check (heading between 0 and 359),
  altitude_m real,
  accuracy_m real,
  satellites smallint,
  ignition boolean,
  battery_pct smallint check (battery_pct between 0 and 100),
  attrs jsonb not null default '{}'::jsonb,
  source text not null check (source in ('device', 'simulator')),
  foreign key (org_id, device_id) references devices(org_id, id) on delete cascade
);
-- Gateways retry: the same fix from the same device is stored once.
create unique index positions_device_time_uq on positions(device_id, recorded_at);
create index positions_vehicle_time_idx on positions(vehicle_id, recorded_at desc);
create index positions_org_time_idx on positions(org_id, recorded_at);

-- Latest known state per vehicle, for the live map.
create table vehicle_live_state (
  vehicle_id uuid primary key,
  org_id uuid not null,
  device_id uuid not null,
  recorded_at timestamptz not null,
  geom geography(Point, 4326) not null,
  speed_kmh real not null,
  heading smallint,
  ignition boolean,
  moving_since timestamptz,
  stopped_since timestamptz,
  source text not null check (source in ('device', 'simulator')),
  updated_at timestamptz not null default now(),
  foreign key (org_id, vehicle_id) references vehicles(org_id, id) on delete cascade
);
create index vehicle_live_state_org_idx on vehicle_live_state(org_id);

-- Read-only for the application role: writes come from the ingest pipeline (system context).
grant select on positions, vehicle_live_state to winou_app;

alter table positions enable row level security;
create policy tenant_isolation on positions using (org_id = current_org_id()) with check (org_id = current_org_id());
alter table vehicle_live_state enable row level security;
create policy tenant_isolation on vehicle_live_state using (org_id = current_org_id()) with check (org_id = current_org_id());
