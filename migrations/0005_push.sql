-- Recordatorios (avisos al móvil). Pégalo en la consola de D1 una sola vez (después de 0004_freezes.sql).
CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint  TEXT PRIMARY KEY,
  p256dh    TEXT NOT NULL,
  auth      TEXT NOT NULL,
  uid       TEXT,
  device    TEXT NOT NULL,
  streak    INTEGER NOT NULL DEFAULT 0,
  last_play TEXT,
  last_new  TEXT,
  last_risk TEXT,
  kind      TEXT,
  created   INTEGER NOT NULL
);
