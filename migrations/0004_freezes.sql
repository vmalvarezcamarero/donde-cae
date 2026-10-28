-- Protectores de racha. Pégalo en la consola de D1 una sola vez (después de 0003_trails.sql).
ALTER TABLE users ADD COLUMN freezes INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS frozen_days (uid TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (uid, date));
