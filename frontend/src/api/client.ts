const jsonRequest = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Request failed");
  }

  return (await response.json()) as T;
};

export type UploadReceiptResponse = {
  id: string;
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

export const api = {
  get: <T>(url: string) => jsonRequest<T>(url),
  post: <T>(url: string, body?: unknown) =>
    jsonRequest<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => jsonRequest<T>(url, { method: "DELETE" })
};

export const uploadReceiptImage = async (file: Blob): Promise<UploadReceiptResponse> => {
  const formData = new FormData();
  formData.append("receiptImage", file, "receipt.jpg");

  const response = await fetch("/api/receipts", {
    method: "POST",
    body: formData,
    credentials: "include"
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Upload failed");
  }

  return (await response.json()) as UploadReceiptResponse;
};
