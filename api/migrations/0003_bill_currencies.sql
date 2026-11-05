ALTER TABLE bills
ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'INR'
CHECK (currency_code IN ('USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'AED'));
