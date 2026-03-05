import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { AppNav } from "../components/AppNav";
import type { ReceiptSummary } from "../types";

export const DashboardPage = () => {
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ receipts: ReceiptSummary[] }>("/api/receipts")
      .then((data) => setReceipts(data.receipts))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard data"))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const totalReceipts = receipts.length;
    const totalAmount = receipts.reduce((sum, receipt) => sum + (receipt.amount ?? 0), 0);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const receiptsThisMonth = receipts.filter((receipt) => {
      if (!receipt.transaction_date) return false;
      const [y, m] = receipt.transaction_date.split("-").map(Number);
      return y === year && m === month;
    }).length;
    return { totalReceipts, totalAmount, receiptsThisMonth };
  }, [receipts]);

  const recent = useMemo(() => [...receipts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8), [receipts]);

  return (
    <main className="page">
      <AppNav />
      <header className="topbar">
        <h1>Dashboard</h1>
        <p className="muted">Fast overview of receipt processing activity.</p>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <span>Total Receipts</span>
          <strong>{stats.totalReceipts}</strong>
        </article>
        <article className="stat-card">
          <span>Total Amount Processed</span>
          <strong>{stats.totalAmount.toFixed(2)} CHF</strong>
        </article>
        <article className="stat-card">
          <span>Receipts This Month</span>
          <strong>{stats.receiptsThisMonth}</strong>
        </article>
      </section>

      <section className="card table-card">
        <h2>Recent Receipts</h2>
        {loading && <p>Loading...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Card</th>
                <th>Merchant</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((receipt) => (
                <tr key={receipt.id}>
                  <td>
                    <img alt="Receipt preview" className="thumb" src={receipt.imageUrl} />
                  </td>
                  <td>{receipt.transaction_date ?? "n/a"} {receipt.transaction_time ?? ""}</td>
                  <td>{receipt.amount !== null ? `${receipt.amount.toFixed(2)} ${receipt.currency ?? ""}` : "n/a"}</td>
                  <td>{receipt.card_type ?? "n/a"} {receipt.card_last4 ? `****${receipt.card_last4}` : ""}</td>
                  <td>{receipt.merchant_name ?? "n/a"}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td className="empty-cell" colSpan={5}>
                    No receipts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
};
