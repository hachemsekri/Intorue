-- Milestone 3: zones (geofences), alert rules, alert evaluation state, alerts.

create table geofences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('circle', 'polygon')),
  -- What the user drew: circle centre/radius or polygon points (kept for editing).
  shape jsonb not null,
  -- Area used for checks; circles are stored as buffered polygons.
  geom geography(Polygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create index geofences_org_idx on geofences(org_id);
create index geofences_geom_idx on geofences using gist(geom);

create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in ('speeding', 'geofence_exit', 'geofence_enter', 'movement_schedule', 'device_offline', 'low_battery')),
  name text not null,
  enabled boolean not null default true,
  severity text not null check (severity in ('urgent', 'warning')),
  params jsonb not null,
  -- Null = applies to every vehicle of the organization.
  vehicle_ids uuid[],
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create index alert_rules_org_idx on alert_rules(org_id) where enabled;

-- Per rule and vehicle: what the evaluator remembers between fixes (inside a zone, already alerted…).
create table alert_states (
  rule_id uuid not null,
  vehicle_id uuid not null,
  org_id uuid not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (rule_id, vehicle_id),
  foreign key (org_id, rule_id) references alert_rules(org_id, id) on delete cascade,
  foreign key (org_id, vehicle_id) references vehicles(org_id, id) on delete cascade
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  rule_id uuid references alert_rules(id) on delete set null,
  vehicle_id uuid not null,
  type text not null,
  severity text not null check (severity in ('urgent', 'warning')),
  occurred_at timestamptz not null,
  geom geography(Point, 4326),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'handled')),
  handled_by uuid references users(id) on delete set null,
  handled_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  foreign key (org_id, vehicle_id) references vehicles(org_id, id) on delete cascade
);
create index alerts_inbox_idx on alerts(org_id, status, occurred_at desc);
create index alerts_vehicle_time_idx on alerts(vehicle_id, occurred_at);

grant select, insert, update, delete on geofences, alert_rules to winou_app;
-- Alerts are created by the engine (system context); the app can read them and mark them handled.
grant select, update on alerts to winou_app;

alter table geofences enable row level security;
create policy tenant_isolation on geofences using (org_id = current_org_id()) with check (org_id = current_org_id());
alter table alert_rules enable row level security;
create policy tenant_isolation on alert_rules using (org_id = current_org_id()) with check (org_id = current_org_id());
alter table alert_states enable row level security;
create policy tenant_isolation on alert_states using (org_id = current_org_id()) with check (org_id = current_org_id());
alter table alerts enable row level security;
create policy tenant_isolation on alerts using (org_id = current_org_id()) with check (org_id = current_org_id());
