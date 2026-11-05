-- Milestone 4: push notifications to the mobile app.

-- One row per installed app (a user can have several phones). Tokens are global (not org-scoped):
-- which alerts a token receives is decided from the user's memberships at send time.
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on push_tokens(user_id);

-- Per user and organization: whether to receive alert notifications, and only urgent ones or all.
create table push_preferences (
  user_id uuid not null references users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  enabled boolean not null default true,
  urgent_only boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
