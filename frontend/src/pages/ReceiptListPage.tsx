import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { AppNav } from "../components/AppNav";
import { useAuth } from "../contexts/AuthContext";
import type { ReceiptDetail, ReceiptSummary } from "../types";

const getReceiptStatus = (receipt: ReceiptSummary): "Verified" | "Needs Review" => {
  const required = [receipt.amount !== null, !!receipt.card_type, !!receipt.card_last4, !!receipt.transaction_date];
  return required.every(Boolean) ? "Verified" : "Needs Review";
};

export const ReceiptListPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ReceiptDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "needs_review">("all");

  const loadReceipts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ receipts: ReceiptSummary[] }>("/api/receipts");
      setReceipts(data.receipts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load receipts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      setShowRawOutput(false);
      return;
    }
    setShowRawOutput(false);
    setLoadingDetail(true);
    api
      .get<ReceiptDetail>(`/api/receipts/${selectedId}`)
      .then(setSelectedDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load receipt detail"))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const visibleReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = receipts.filter((receipt) => {
      if (!q) return true;
      const haystack = [
        receipt.id,
        receipt.card_type ?? "",
        receipt.card_last4 ?? "",
        receipt.merchant_name ?? "",
        receipt.transaction_date ?? ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    }).filter((receipt) => {
      if (statusFilter === "all") return true;
      const status = getReceiptStatus(receipt);
      if (statusFilter === "verified") return status === "Verified";
      return status === "Needs Review";
    });

    const sorted = [...filtered];
    if (sortBy === "amount_desc") {
      sorted.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));
    } else if (sortBy === "amount_asc") {
      sorted.sort((a, b) => (a.amount ?? Number.MAX_SAFE_INTEGER) - (b.amount ?? Number.MAX_SAFE_INTEGER));
    } else {
      sorted.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }
    return sorted;
  }, [receipts, search, sortBy, statusFilter]);

  const onDeleteReceipt = async (receiptId: string) => {
    const confirmed = window.confirm("Delete this receipt?");
    if (!confirmed) return;
    setError(null);
    try {
      await api.delete<{ ok: true }>(`/api/receipts/${receiptId}`);
      if (selectedId === receiptId) {
        setSelectedId(null);
      }
      await loadReceipts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete receipt");
    }
  };

  const onDownloadExcel = async () => {
    setError(null);
    try {
      const response = await fetch("/api/receipts/export.xlsx", {
        credentials: "include"
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to download Excel export");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipts-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download Excel export");
    }
  };

  return (
    <main className="page">
      <AppNav />
      <header className="list-header card">
        <div className="list-header-title">
          <h1>Receipts</h1>
          <p className="muted">Search, sort, and review scanned receipts quickly.</p>
        </div>
        <div className="list-header-meta">
          <span className="meta-pill">{visibleReceipts.length} shown</span>
          <span className="meta-pill">500 max rows</span>
        </div>
      </header>
      <section className="card table-toolbar">
        <input
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search receipt, merchant, OTA, card, date..."
          value={search}
        />
        <select onChange={(event) => setStatusFilter(event.target.value as "all" | "verified" | "needs_review")} value={statusFilter}>
          <option value="all">All Status</option>
          <option value="verified">Verified</option>
          <option value="needs_review">Needs Review</option>
        </select>
        <select onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
          <option value="date_desc">Newest first</option>
          <option value="amount_desc">Amount high to low</option>
          <option value="amount_asc">Amount low to high</option>
        </select>
        <button onClick={loadReceipts} type="button">
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        <button className="ghost" onClick={onDownloadExcel} type="button">
          Download Excel
        </button>
      </section>
      {error && <p className="error">{error}</p>}
      <section className="card table-card">
        <div className="table-section-header">
          <div>
            <h2>Receipt Records</h2>
            <p>Latest scanned receipts with parsed payment metadata</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th><span className="col-title">Preview</span></th>
                <th><span className="col-title">Receipt Note</span></th>
                <th><span className="col-title">Date & Time</span></th>
                <th><span className="col-title">Amount</span></th>
                <th><span className="col-title">Card Type</span></th>
                <th><span className="col-title">Last 4</span></th>
                <th><span className="col-title">Status</span></th>
                <th><span className="col-title">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleReceipts.map((receipt) => {
                const status = getReceiptStatus(receipt);
                return (
                  <tr key={receipt.id} onClick={() => setSelectedId(receipt.id)}>
                    <td>
                      <img alt="Receipt preview" className="thumb" src={receipt.imageUrl} />
                    </td>
                    <td>
                      <span className={`receipt-note-pill ${receipt.article_text && receipt.article_text.trim() ? "" : "empty"}`}>
                        {receipt.article_text && receipt.article_text.trim() ? receipt.article_text : "n/a"}
                      </span>
                    </td>
                    <td>{receipt.transaction_date ?? "n/a"} {receipt.transaction_time ?? ""}</td>
                    <td>{receipt.amount !== null ? `${receipt.amount.toFixed(2)} ${receipt.currency ?? ""}` : "n/a"}</td>
                    <td>{receipt.card_type ?? "n/a"}</td>
                    <td>{receipt.card_last4 ?? "n/a"}</td>
                    <td>
                      <span className={`status-pill ${status === "Verified" ? "ok" : "warn"}`}>{status}</span>
                    </td>
                    <td>
                      <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          className="ghost compact"
                          onClick={() => navigate(`/receipts/${receipt.id}`)}
                          type="button"
                        >
                          Open
                        </button>
                        {user?.role === "admin" && (
                          <button className="danger compact" onClick={() => onDeleteReceipt(receipt.id)} type="button">
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && visibleReceipts.length === 0 && <div className="empty-state">No receipts found.</div>}
      </section>

      {selectedId && (
        <aside className="detail-drawer">
          <div className="detail-drawer-header">
            <h2>Receipt Detail</h2>
            <button className="ghost compact" onClick={() => setSelectedId(null)} type="button">
              Close
            </button>
          </div>
          {loadingDetail || !selectedDetail ? (
            <p>Loading...</p>
          ) : (
            <div className="detail-split">
              <div>
                <img alt="Receipt" src={selectedDetail.imageUrl} />
              </div>
              <div className="detail-grid">
                <p><strong>Merchant:</strong> {selectedDetail.merchant_name ?? "n/a"}</p>
                <p><strong>Amount:</strong> {selectedDetail.amount !== null ? `${selectedDetail.amount.toFixed(2)} ${selectedDetail.currency ?? ""}` : "n/a"}</p>
                <p><strong>Date:</strong> {selectedDetail.transaction_date ?? "n/a"} {selectedDetail.transaction_time ?? ""}</p>
                <p><strong>Card Type:</strong> {selectedDetail.card_type ?? "n/a"}</p>
                <p><strong>Last4:</strong> {selectedDetail.card_last4 ?? "n/a"}</p>
                <p><strong>PAN:</strong> {selectedDetail.pan_masked ?? "n/a"}</p>
                <p><strong>Expiry:</strong> {selectedDetail.card_expiry ?? "n/a"}</p>
                <p><strong>Entry:</strong> {selectedDetail.card_entry ?? "n/a"}</p>
                <p><strong>Auth Code:</strong> {selectedDetail.auth_code ?? "n/a"}</p>
                <p><strong>Terminal ID:</strong> {selectedDetail.terminal_id ?? "n/a"}</p>
                <p><strong>Merchant ID:</strong> {selectedDetail.merchant_id ?? "n/a"}</p>
                <p><strong>Transaction No:</strong> {selectedDetail.transaction_no ?? "n/a"}</p>
                <p><strong>AID:</strong> {selectedDetail.aid ?? "n/a"}</p>
                <p><strong>Article:</strong> {selectedDetail.article_text ?? "n/a"}</p>
                <button
                  className="raw-output-toggle"
                  onClick={() => setShowRawOutput((current) => !current)}
                  type="button"
                >
                  {showRawOutput ? "Hide Raw Output" : "Show Raw Output"}
                </button>
                {showRawOutput && <pre>{selectedDetail.raw_ocr_text || "No OCR output available."}</pre>}
              </div>
            </div>
          )}
        </aside>
      )}
    </main>
  );
};
