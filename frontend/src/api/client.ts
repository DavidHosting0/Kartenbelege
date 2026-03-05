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

export const api = {
  get: <T>(url: string) => jsonRequest<T>(url),
  post: <T>(url: string, body?: unknown) =>
    jsonRequest<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => jsonRequest<T>(url, { method: "DELETE" })
};

export const uploadReceiptImage = async (file: Blob): Promise<{ id: string }> => {
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

  return (await response.json()) as { id: string };
};
