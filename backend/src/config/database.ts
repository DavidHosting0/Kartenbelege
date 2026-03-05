import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(path.join(dataDir, "app.db"));

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  article_text TEXT,
  merchant_name TEXT,
  card_type TEXT,
  pan_masked TEXT,
  card_expiry TEXT,
  card_entry TEXT,
  amount REAL,
  currency TEXT,
  transaction_date TEXT,
  transaction_time TEXT,
  card_last4 TEXT,
  auth_code TEXT,
  terminal_id TEXT,
  merchant_id TEXT,
  transaction_no TEXT,
  aid TEXT,
  raw_ocr_text TEXT NOT NULL,
  image_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_receipts_user_created ON receipts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_user_amount ON receipts(user_id, amount);
CREATE INDEX IF NOT EXISTS idx_receipts_user_last4 ON receipts(user_id, card_last4);
CREATE INDEX IF NOT EXISTS idx_receipts_user_tx_date ON receipts(user_id, transaction_date);
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some((column) => column.name === "role")) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}

const receiptColumns = db.prepare("PRAGMA table_info(receipts)").all() as Array<{ name: string }>;
const ensureReceiptColumn = (name: string, definition: string): void => {
  if (!receiptColumns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE receipts ADD COLUMN ${name} ${definition}`);
  }
};

ensureReceiptColumn("pan_masked", "TEXT");
ensureReceiptColumn("article_text", "TEXT");
ensureReceiptColumn("merchant_name", "TEXT");
ensureReceiptColumn("card_expiry", "TEXT");
ensureReceiptColumn("card_entry", "TEXT");
ensureReceiptColumn("auth_code", "TEXT");
ensureReceiptColumn("terminal_id", "TEXT");
ensureReceiptColumn("merchant_id", "TEXT");
ensureReceiptColumn("transaction_no", "TEXT");
ensureReceiptColumn("aid", "TEXT");
