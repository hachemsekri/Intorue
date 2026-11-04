-- Device identifiers: 8–20 digits (usually the 15-digit IMEI; some trackers use shorter IDs).
alter table devices drop constraint if exists devices_imei_check;
alter table devices add constraint devices_imei_check check (imei ~ '^[0-9]{8,20}$');
