export type AuthUser = {
  id: string;
  username: string;
  role: "admin" | "user";
};

export type ParsedReceipt = {
  articleText: string | null;
  merchantName: string | null;
  cardType: string | null;
  panMasked: string | null;
  cardExpiry: string | null;
  cardEntry: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  amount: number | null;
  currency: string | null;
  cardLast4: string | null;
  authCode: string | null;
  terminalId: string | null;
  merchantId: string | null;
  transactionNo: string | null;
  aid: string | null;
};
