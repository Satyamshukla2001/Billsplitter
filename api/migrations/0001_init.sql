-- Money is always stored as whole cents (INTEGER). Every table has named constraints
-- so a failing write tells you which rule was broken.

CREATE TABLE homes (
  id         TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT homes_pk PRIMARY KEY (id),
  -- stops: a home with an empty or whitespace-only name
  CONSTRAINT homes_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE members (
  -- `position` is the order members were added. Part 2 depends on it (who gets the extra cents).
  -- AUTOINCREMENT guarantees it only grows, so two members never swap places.
  position INTEGER CONSTRAINT members_pk PRIMARY KEY AUTOINCREMENT,
  id       TEXT NOT NULL,
  home_id  TEXT NOT NULL,
  name     TEXT NOT NULL,
  CONSTRAINT members_id_unique UNIQUE (id),
  -- needed so that `shares` can point at (member, home) together
  CONSTRAINT members_id_home_unique UNIQUE (id, home_id),
  -- stops: a member of a home that does not exist
  CONSTRAINT members_home_fk FOREIGN KEY (home_id) REFERENCES homes (id),
  CONSTRAINT members_name_not_blank CHECK (length(trim(name)) > 0)
);
CREATE INDEX members_home_idx ON members (home_id, position);

CREATE TABLE bills (
  id          TEXT NOT NULL,
  home_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT bills_pk PRIMARY KEY (id),
  CONSTRAINT bills_id_home_unique UNIQUE (id, home_id),
  CONSTRAINT bills_home_fk FOREIGN KEY (home_id) REFERENCES homes (id),
  -- stops: zero, negative, decimal or text amounts, even if the API check had a bug
  CONSTRAINT bills_total_positive_integer CHECK (typeof(total_cents) = 'integer' AND total_cents > 0),
  CONSTRAINT bills_title_not_blank CHECK (length(trim(title)) > 0)
);
CREATE INDEX bills_home_idx ON bills (home_id);

CREATE TABLE shares (
  id           TEXT NOT NULL,
  bill_id      TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  home_id      TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at      TEXT,
  -- the Idempotency-Key that paid this share; lets a retry get the same answer
  payment_key  TEXT,
  CONSTRAINT shares_pk PRIMARY KEY (id),
  -- stops: one member getting two shares of the same bill
  CONSTRAINT shares_one_per_member UNIQUE (bill_id, member_id),
  -- stops: a share whose bill and member belong to different homes
  CONSTRAINT shares_bill_home_fk FOREIGN KEY (bill_id, home_id) REFERENCES bills (id, home_id),
  CONSTRAINT shares_member_home_fk FOREIGN KEY (member_id, home_id) REFERENCES members (id, home_id),
  CONSTRAINT shares_amount_non_negative_integer CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  -- stops: a share that is "paid" without a key, or has a key but no payment time
  CONSTRAINT shares_paid_state_consistent CHECK ((paid_at IS NULL) = (payment_key IS NULL))
);
CREATE INDEX shares_bill_idx ON shares (bill_id);
CREATE INDEX shares_member_idx ON shares (member_id);
