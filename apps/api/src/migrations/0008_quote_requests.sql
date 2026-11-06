-- Home page: a reservation is now a quote request with vehicle counts. Totals are calculated
-- by the server from packages/config/src/pricing.ts and stored as quoted at that moment.
alter table reservations alter column vehicle_type drop not null;
alter table reservations
  add column client_type text check (client_type in ('individual', 'company')),
  add column company text check (company is null or char_length(company) <= 120),
  add column qty_car integer not null default 0 check (qty_car between 0 and 99),
  add column qty_moto integer not null default 0 check (qty_moto between 0 and 99),
  add column qty_trot integer not null default 0 check (qty_trot between 0 and 99),
  add column total_dt integer check (total_dt >= 0),
  add column saved_dt integer check (saved_dt >= 0),
  add column updated_at timestamptz;
