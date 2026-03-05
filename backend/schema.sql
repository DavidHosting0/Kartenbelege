CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_type TEXT,
  amount REAL,
  currency TEXT,
  transaction_date TEXT,
  transaction_time TEXT,
  card_last4 TEXT,
  raw_ocr_text TEXT NOT NULL,
  image_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX idx_receipts_user_created ON receipts(user_id, created_at DESC);
CREATE INDEX idx_receipts_user_amount ON receipts(user_id, amount);
CREATE INDEX idx_receipts_user_last4 ON receipts(user_id, card_last4);
CREATE INDEX idx_receipts_user_tx_date ON receipts(user_id, transaction_date);
