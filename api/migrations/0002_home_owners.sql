ALTER TABLE homes
ADD COLUMN owner_email TEXT NOT NULL DEFAULT 'local@localhost';

CREATE INDEX homes_owner_idx ON homes (owner_email);
