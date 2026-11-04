-- Editing a rule or a zone resets the remembered evaluation state of the affected rules.
-- The application role may read and clear that state for its own organization (RLS still applies);
-- only the engine (system context) writes it.
grant select, delete on alert_states to winou_app;
