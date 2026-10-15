-- Super admin accounts (the Tatak owner), separate from shop accounts.
-- There is no sign-up page: accounts are made with `npm run superadmin`.

CREATE TABLE super_admins (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                 -- PBKDF2, same format as shops.password_hash
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE super_sessions (
  token_hash     TEXT PRIMARY KEY,             -- sha-256 of the cookie value
  super_admin_id TEXT NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
  expires_at     INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX super_sessions_admin ON super_sessions(super_admin_id);
