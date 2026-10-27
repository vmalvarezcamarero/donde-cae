-- Estelas de la canica. Pégalo en la consola de D1 una sola vez (después de 0002_shop.sql).
ALTER TABLE users ADD COLUMN trail TEXT NOT NULL DEFAULT 'classic';
