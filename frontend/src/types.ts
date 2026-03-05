export type User = {
  id: string;
  username: string;
  role: "admin" | "user";
};

export type ReceiptSummary = {
  id: string;
  article_text: string | null;
  card_type: string | null;
  amount: number | null;
  currency: string | null;
  transaction_date: string | null;
  transaction_time: string | null;
  card_last4: string | null;
  merchant_name: string | null;
  imageUrl: string;
  created_at: string;
};

export type ReceiptDetail = ReceiptSummary & {
  user_id: string;
  article_text: string | null;
  pan_masked: string | null;
  card_expiry: string | null;
  card_entry: string | null;
  auth_code: string | null;
  terminal_id: string | null;
  merchant_id: string | null;
  transaction_no: string | null;
  aid: string | null;
  raw_ocr_text: string;
  imageUrl: string;
};
