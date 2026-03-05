import { AppNav } from "../components/AppNav";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

type AnalyticsResponse = {
  summary: {
    totalReceipts: number;
    totalAmount: number;
    averageAmount: number;
    receiptsThisMonth: number;
    verifiedCount: number;
    needsReviewCount: number;
  };
  monthly: Array<{
    month: string;
    count: number;
    totalAmount: number;
  }>;
  cardTypes: Array<{
    cardType: string;
    count: number;
    totalAmount: number;
  }>;
};

export const AnalyticsPage = () => {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get<AnalyticsResponse>("/api/receipts/analytics")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  const maxMonthlyCount = useMemo(() => Math.max(1, ...(data?.monthly.map((row) => row.count) ?? [1])), [data]);
  const maxCardCount = useMemo(() => Math.max(1, ...(data?.cardTypes.map((row) => row.count) ?? [1])), [data]);

  return (
    <main className="page">
      <AppNav />
      <header className="topbar">
        <h1>Analytics</h1>
        <p className="muted">Insights for spending patterns and card usage.</p>
      </header>

      {loading && <section className="card"><p>Loading analytics...</p></section>}
      {error && <section className="card"><p className="error">{error}</p></section>}

      {data && (
        <>
          <section className="stats-grid">
            <article className="stat-card">
              <span>Total Receipts</span>
              <strong>{data.summary.totalReceipts}</strong>
            </article>
            <article className="stat-card">
              <span>Total Amount Processed</span>
              <strong>{data.summary.totalAmount.toFixed(2)} CHF</strong>
            </article>
            <article className="stat-card">
              <span>Receipts This Month</span>
              <strong>{data.summary.receiptsThisMonth}</strong>
            </article>
          </section>

          <section className="analytics-grid">
            <article className="card analytics-card">
              <h2>Verification Health</h2>
              <div className="health-row">
                <span>Verified</span>
                <strong>{data.summary.verifiedCount}</strong>
              </div>
              <div className="health-row">
                <span>Needs Review</span>
                <strong>{data.summary.needsReviewCount}</strong>
              </div>
              <div className="health-row">
                <span>Average Amount</span>
                <strong>{data.summary.averageAmount.toFixed(2)} CHF</strong>
              </div>
            </article>

            <article className="card analytics-card">
              <h2>Monthly Receipt Volume</h2>
              <div className="analytics-bars">
                {data.monthly.map((row) => (
                  <div className="bar-row" key={row.month}>
                    <span>{row.month}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(row.count / maxMonthlyCount) * 100}%` }} />
                    </div>
                    <strong>{row.count}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="card analytics-card">
              <h2>Card Type Breakdown</h2>
              <div className="analytics-bars">
                {data.cardTypes.map((row) => (
                  <div className="bar-row" key={row.cardType}>
                    <span>{row.cardType}</span>
                    <div className="bar-track">
                      <div className="bar-fill alt" style={{ width: `${(row.count / maxCardCount) * 100}%` }} />
                    </div>
                    <strong>{row.count}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      )}
    </main>
  );
};
