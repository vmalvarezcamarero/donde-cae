-- Esquema de la base de datos de Physle (Cloudflare D1, SQLite).
-- Pégalo en la consola de D1 una sola vez al crear la base de datos.

CREATE TABLE IF NOT EXISTS users (
  uid        TEXT PRIMARY KEY,             -- id de Firebase Auth
  nickname   TEXT NOT NULL UNIQUE COLLATE NOCASE,
  country    TEXT NOT NULL,                -- código ISO de 2 letras
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player      TEXT NOT NULL,               -- 'u:<uid>' con cuenta, 'd:<dispositivo>' sin cuenta
  uid         TEXT,                        -- solo si jugaba con cuenta
  device      TEXT NOT NULL,
  date        TEXT NOT NULL,               -- AAAA-MM-DD del reto
  num         INTEGER NOT NULL,            -- 1, 2 (3 en el futuro, viendo un vídeo)
  set_id      TEXT NOT NULL,               -- 'A' o 'B'
  round       INTEGER NOT NULL DEFAULT 0,  -- siguiente ronda por jugar (0-5)
  predictions TEXT NOT NULL DEFAULT '[]',
  scores      TEXT NOT NULL DEFAULT '[]',
  total       INTEGER NOT NULL DEFAULT 0,
  finished    INTEGER NOT NULL DEFAULT 0,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE (player, date, num)
);

CREATE INDEX IF NOT EXISTS attempts_rank   ON attempts (date, finished, uid);
CREATE INDEX IF NOT EXISTS attempts_device ON attempts (date, device);
CREATE INDEX IF NOT EXISTS attempts_uid    ON attempts (uid, date);
