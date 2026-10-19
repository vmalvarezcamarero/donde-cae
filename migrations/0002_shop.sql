-- Monedas y tienda. Pégalo en la consola de D1 una sola vez (después de 0001_init.sql).
ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN owned TEXT NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN skin TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE users ADD COLUMN name_color TEXT NOT NULL DEFAULT 'default';
ALTER TABLE attempts ADD COLUMN coins INTEGER NOT NULL DEFAULT 0;
