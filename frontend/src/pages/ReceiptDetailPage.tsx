import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { AppNav } from "../components/AppNav";
import type { ReceiptDetail } from "../types";

export const ReceiptDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);

  useEffect(() => {
    if (!id) return;
    setShowRawOutput(false);
    api
      .get<ReceiptDetail>(`/api/receipts/${id}`)
      .then(setReceipt)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load receipt"));
  }, [id]);

  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!receipt) return <main className="page"><p>Loading...</p></main>;
  const valueOrNA = (value: string | null | undefined): string => value && value.trim() ? value : "n/a";
  const amountText = receipt.amount !== null ? `${receipt.amount.toFixed(2)} ${receipt.currency ?? ""}`.trim() : "n/a";
  const status = receipt.amount !== null && receipt.card_type && receipt.card_last4 && receipt.transaction_date ? "Verified" : "Needs Review";

  return (
    <main className="page">
      <AppNav />
      <div className="receipt-detail-layout">
        <section className="receipt-detail-header card">
          <div>
            <p className="detail-back-link"><Link to="/receipts">Back to list</Link></p>
            <h1>Receipt Detail</h1>
          </div>
          <a className="detail-primary-action" download href={receipt.imageUrl} rel="noreferrer" target="_blank">
            Download Receipt
          </a>
        </section>

        <section className="receipt-detail-main card">
          <div className="receipt-detail-grid">
            <div className="receipt-field key tone-neutral">
              <label>Article / Note</label>
              <p>{valueOrNA(receipt.article_text)}</p>
            </div>
            <div className="receipt-field key tone-status">
              <label>Status</label>
              <p><span className={`status-pill ${status === "Verified" ? "ok" : "warn"}`}>{status}</span></p>
            </div>
            <div className="receipt-field key tone-amount">
              <label>Amount</label>
              <p>{amountText}</p>
            </div>
            <div className="receipt-field key tone-date">
              <label>Date & Time</label>
              <p>{valueOrNA(receipt.transaction_date)} {receipt.transaction_time ?? ""}</p>
            </div>
            <div className="receipt-field key tone-card">
              <label>Card Type</label>
              <p>{valueOrNA(receipt.card_type)}</p>
            </div>
            <div className="receipt-field key tone-card">
              <label>Card Last 4</label>
              <p>{valueOrNA(receipt.card_last4)}</p>
            </div>
            <div className="receipt-field plain">
              <label>Masked Card Number</label>
              <p>{valueOrNA(receipt.pan_masked)}</p>
            </div>
            <div className="receipt-field plain">
              <label>Card Expiry</label>
              <p>{valueOrNA(receipt.card_expiry)}</p>
            </div>
            <div className="receipt-field plain">
              <label>Card Entry Method</label>
              <p>{valueOrNA(receipt.card_entry)}</p>
            </div>
            <div className="receipt-field plain">
              <label>Authorization Code</label>
              <p>{valueOrNA(receipt.auth_code)}</p>
            </div>
            <div className="receipt-field plain">
              <label>Terminal ID</label>
              <p>{valueOrNA(receipt.terminal_id)}</p>
            </div>
            <div className="receipt-field plain">
              <label>Merchant ID</label>
              <p>{valueOrNA(receipt.merchant_id)}</p>
            </div>
            <div className="receipt-field plain">
              <label>Transaction Number</label>
              <p>{valueOrNA(receipt.transaction_no)}</p>
            </div>
            <div className="receipt-field plain">
              <label>AID</label>
              <p>{valueOrNA(receipt.aid)}</p>
            </div>
          </div>

          <div className="receipt-image-card">
            <label>Receipt Image</label>
            <img alt="Stored receipt" src={receipt.imageUrl} />
          </div>

          <button
            className="raw-row-toggle"
            onClick={() => setShowRawOutput((current) => !current)}
            type="button"
          >
            <span>{showRawOutput ? "▾" : "▸"} Raw Output</span>
          </button>
          {showRawOutput && <pre>{receipt.raw_ocr_text || "No OCR output available."}</pre>}
        </section>
      </div>
    </main>
  );
};
