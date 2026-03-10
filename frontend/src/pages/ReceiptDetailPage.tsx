import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { AppNav } from "../components/AppNav";
import type { ReceiptDetail } from "../types";

type ReceiptEditForm = {
  article_text: string;
  amount: string;
  currency: string;
  transaction_date: string;
  transaction_time: string;
  card_type: string;
  card_last4: string;
  pan_masked: string;
  card_expiry: string;
  card_entry: string;
  auth_code: string;
  terminal_id: string;
  merchant_id: string;
  transaction_no: string;
  aid: string;
};

export const ReceiptDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ReceiptEditForm>({
    article_text: "",
    amount: "",
    currency: "",
    transaction_date: "",
    transaction_time: "",
    card_type: "",
    card_last4: "",
    pan_masked: "",
    card_expiry: "",
    card_entry: "",
    auth_code: "",
    terminal_id: "",
    merchant_id: "",
    transaction_no: "",
    aid: ""
  });

  const toForm = (data: ReceiptDetail): ReceiptEditForm => ({
    article_text: data.article_text ?? "",
    amount: data.amount !== null ? String(data.amount) : "",
    currency: data.currency ?? "",
    transaction_date: data.transaction_date ?? "",
    transaction_time: data.transaction_time ?? "",
    card_type: data.card_type ?? "",
    card_last4: data.card_last4 ?? "",
    pan_masked: data.pan_masked ?? "",
    card_expiry: data.card_expiry ?? "",
    card_entry: data.card_entry ?? "",
    auth_code: data.auth_code ?? "",
    terminal_id: data.terminal_id ?? "",
    merchant_id: data.merchant_id ?? "",
    transaction_no: data.transaction_no ?? "",
    aid: data.aid ?? ""
  });

  useEffect(() => {
    if (!id) return;
    setShowRawOutput(false);
    api
      .get<ReceiptDetail>(`/api/receipts/${id}`)
      .then((data) => {
        setReceipt(data);
        setForm(toForm(data));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load receipt"));
  }, [id]);

  useEffect(() => {
    if (searchParams.get("edit") === "1") {
      setEditing(true);
    }
  }, [searchParams]);

  const onCancelEdit = () => {
    if (receipt) setForm(toForm(receipt));
    setEditing(false);
    setError(null);
  };

  const onSaveEdit = async () => {
    if (!id) return;
    setError(null);

    const amountValue = form.amount.trim();
    if (amountValue) {
      const parsedAmount = Number(amountValue.replace(",", "."));
      if (!Number.isFinite(parsedAmount)) {
        setError("Amount must be a valid number.");
        return;
      }
    }

    const payload = {
      article_text: form.article_text.trim() || null,
      amount: amountValue ? Number(amountValue.replace(",", ".")) : null,
      currency: form.currency.trim() || null,
      transaction_date: form.transaction_date.trim() || null,
      transaction_time: form.transaction_time.trim() || null,
      card_type: form.card_type.trim() || null,
      card_last4: form.card_last4.trim() || null,
      pan_masked: form.pan_masked.trim() || null,
      card_expiry: form.card_expiry.trim() || null,
      card_entry: form.card_entry.trim() || null,
      auth_code: form.auth_code.trim() || null,
      terminal_id: form.terminal_id.trim() || null,
      merchant_id: form.merchant_id.trim() || null,
      transaction_no: form.transaction_no.trim() || null,
      aid: form.aid.trim() || null
    };

    setSaving(true);
    try {
      const updated = await api.patch<ReceiptDetail>(`/api/receipts/${id}`, payload);
      setReceipt(updated);
      setForm(toForm(updated));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save receipt updates");
    } finally {
      setSaving(false);
    }
  };

  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!receipt) return <main className="page"><p>Loading...</p></main>;
  const valueOrNA = (value: string | null | undefined): string => value && value.trim() ? value : "n/a";
  const amountText = receipt.amount !== null ? `${receipt.amount.toFixed(2)} ${receipt.currency ?? ""}`.trim() : "n/a";
  const status = receipt.amount !== null && receipt.card_type && receipt.card_last4 && receipt.transaction_date ? "Verified" : "Needs Review";
  const renderField = (
    label: string,
    key: keyof ReceiptEditForm,
    fallbackValue: string,
    className: string,
    type: "text" | "number" = "text"
  ) => (
    <div className={className}>
      <label>{label}</label>
      {editing ? (
        <input
          onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
          type={type}
          value={form[key]}
        />
      ) : (
        <p>{fallbackValue}</p>
      )}
    </div>
  );

  return (
    <main className="page">
      <AppNav />
      <div className="receipt-detail-layout">
        <section className="receipt-detail-header card">
          <div>
            <p className="detail-back-link"><Link to="/receipts">Back to list</Link></p>
            <h1>Receipt Detail</h1>
          </div>
          <div className="detail-header-actions">
            {!editing ? (
              <button className="ghost compact" onClick={() => setEditing(true)} type="button">
                Edit fields
              </button>
            ) : (
              <>
                <button className="ghost compact" onClick={onCancelEdit} type="button">
                  Cancel
                </button>
                <button className="compact" disabled={saving} onClick={onSaveEdit} type="button">
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            )}
            <a className="detail-primary-action" download href={receipt.imageUrl} rel="noreferrer" target="_blank">
              Download Receipt
            </a>
          </div>
        </section>

        <section className="receipt-detail-main card">
          <div className="receipt-detail-grid">
            {renderField("Article / Note", "article_text", valueOrNA(receipt.article_text), "receipt-field key tone-neutral")}
            <div className="receipt-field key tone-status">
              <label>Status</label>
              <p><span className={`status-pill ${status === "Verified" ? "ok" : "warn"}`}>{status}</span></p>
            </div>
            {renderField("Amount", "amount", amountText, "receipt-field key tone-amount", "number")}
            <div className="receipt-field key tone-date">
              <label>Date & Time</label>
              {editing ? (
                <div className="detail-inline-inputs">
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, transaction_date: event.target.value }))}
                    placeholder="YYYY-MM-DD"
                    value={form.transaction_date}
                  />
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, transaction_time: event.target.value }))}
                    placeholder="HH:mm"
                    value={form.transaction_time}
                  />
                </div>
              ) : (
                <p>{valueOrNA(receipt.transaction_date)} {receipt.transaction_time ?? ""}</p>
              )}
            </div>
            {renderField("Currency", "currency", valueOrNA(receipt.currency), "receipt-field plain")}
            {renderField("Card Type", "card_type", valueOrNA(receipt.card_type), "receipt-field key tone-card")}
            {renderField("Card Last 4", "card_last4", valueOrNA(receipt.card_last4), "receipt-field key tone-card")}
            {renderField("Masked Card Number", "pan_masked", valueOrNA(receipt.pan_masked), "receipt-field plain")}
            {renderField("Card Expiry", "card_expiry", valueOrNA(receipt.card_expiry), "receipt-field plain")}
            {renderField("Card Entry Method", "card_entry", valueOrNA(receipt.card_entry), "receipt-field plain")}
            {renderField("Authorization Code", "auth_code", valueOrNA(receipt.auth_code), "receipt-field plain")}
            {renderField("Terminal ID", "terminal_id", valueOrNA(receipt.terminal_id), "receipt-field plain")}
            {renderField("Merchant ID", "merchant_id", valueOrNA(receipt.merchant_id), "receipt-field plain")}
            {renderField("Transaction Number", "transaction_no", valueOrNA(receipt.transaction_no), "receipt-field plain")}
            {renderField("AID", "aid", valueOrNA(receipt.aid), "receipt-field plain")}
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
