import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppNav } from "../components/AppNav";
import { uploadReceiptImage, type UploadReceiptResponse } from "../api/client";

declare global {
  interface Window {
    ImageCapture?: {
      new (track: MediaStreamTrack): {
        takePhoto: () => Promise<Blob>;
      };
    };
  }
}

export const CameraPage = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready to capture");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{
    receiptId: string;
    previewUrl: string;
    score: number;
    level: "Excellent" | "Good" | "Fair" | "Needs Review";
    foundCount: number;
    totalCount: number;
    missingFields: string[];
    duplicate: {
      isLikelyDuplicate: boolean;
      level: "none" | "possible" | "likely";
      confidence: number;
      matchedReceiptId: string | null;
      reasons: string[];
    } | null;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (review?.previewUrl) {
        URL.revokeObjectURL(review.previewUrl);
      }
    };
  }, [review]);

  const hasValue = (value: string | number | null | undefined) =>
    value !== null && value !== undefined && String(value).trim().length > 0;

  const buildReview = (result: UploadReceiptResponse, previewUrl: string) => {
    const checks = [
      { label: "Date", ok: hasValue(result.transactionDate), weight: 1 },
      { label: "Time", ok: hasValue(result.transactionTime), weight: 0.5 },
      { label: "Amount", ok: result.amount !== null, weight: 2 },
      { label: "Currency", ok: hasValue(result.currency), weight: 1 },
      { label: "Card Type", ok: hasValue(result.cardType), weight: 1.5 },
      { label: "Card Last 4", ok: hasValue(result.cardLast4), weight: 1.5 },
      { label: "Masked Card Number", ok: hasValue(result.panMasked), weight: 1 },
      { label: "Card Entry", ok: hasValue(result.cardEntry), weight: 0.5 },
      { label: "Auth Code", ok: hasValue(result.authCode), weight: 0.5 },
      { label: "Terminal ID", ok: hasValue(result.terminalId), weight: 0.5 },
      { label: "Merchant ID", ok: hasValue(result.merchantId), weight: 0.5 },
      { label: "Transaction No", ok: hasValue(result.transactionNo), weight: 0.75 },
      { label: "AID", ok: hasValue(result.aid), weight: 0.75 },
      { label: "Receipt Note", ok: hasValue(result.articleText), weight: 0.5 }
    ];

    const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
    const foundWeight = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
    const score = Math.round((foundWeight / totalWeight) * 100);
    const foundCount = checks.filter((check) => check.ok).length;
    const missingFields = checks.filter((check) => !check.ok).map((check) => check.label);

    let level: "Excellent" | "Good" | "Fair" | "Needs Review" = "Needs Review";
    if (score >= 85) level = "Excellent";
    else if (score >= 70) level = "Good";
    else if (score >= 50) level = "Fair";

    return {
      receiptId: result.id,
      previewUrl,
      score,
      level,
      foundCount,
      totalCount: checks.length,
      missingFields,
      duplicate: result.duplicateCheck ?? null
    };
  };

  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setError("Camera access failed. Use the fallback upload button below.");
      }
    };
    init();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const sendForOcr = async (blob: Blob) => {
    const previewUrl = URL.createObjectURL(blob);
    setBusy(true);
    setStatus("Uploading and processing OCR...");
    setError(null);
    setReview((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
    try {
      const result = await uploadReceiptImage(blob);
      setReview(buildReview(result, previewUrl));
      setStatus("Receipt processed and saved.");
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("Capture failed");
    } finally {
      setBusy(false);
    }
  };

  const closeReview = () => {
    setReview((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  };

  const deleteUploadedReceipt = async () => {
    if (!review) return;
    const confirmed = window.confirm("Delete this receipt?");
    if (!confirmed) return;
    try {
      await fetch(`/api/receipts/${review.receiptId}/recent-delete`, {
        method: "DELETE",
        credentials: "include"
      }).then(async (response) => {
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Failed to delete receipt");
        }
      });
      setStatus("Receipt deleted.");
      closeReview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete receipt");
    }
  };

  const capturePhoto = async () => {
    const stream = streamRef.current;
    if (!stream) {
      setError("No active camera stream.");
      return;
    }
    try {
      const track = stream.getVideoTracks()[0];
      const imageCapture = window.ImageCapture ? new window.ImageCapture(track) : null;
      if (!imageCapture) {
        setError("High-quality capture is not supported on this device. Use fallback upload.");
        return;
      }
      const blob = await imageCapture.takePhoto();
      await sendForOcr(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera capture failed");
    }
  };

  const onFallbackFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await sendForOcr(file);
    event.currentTarget.value = "";
  };

  return (
    <main className="page">
      <AppNav />
      <header className="topbar">
        <h1>Scan Receipt</h1>
        <p className="muted">Capture and process new card receipts in seconds.</p>
      </header>
      <section className="card camera-wrap">
        <video autoPlay playsInline muted ref={videoRef} />
      </section>
      <button className="primary" disabled={busy} onClick={capturePhoto}>
        {busy ? "Processing..." : "Take Photo"}
      </button>
      <label className="secondary-upload">
        Fallback camera upload
        <input accept="image/*" capture="environment" onChange={onFallbackFile} type="file" />
      </label>
      <p>{status}</p>
      {error && <p className="error">{error}</p>}
      {review && (
        <div className="review-modal-overlay" onClick={closeReview} role="presentation">
          <section className="card review-modal" onClick={(event) => event.stopPropagation()}>
            <div className="scan-review-head">
              <h2>Scan Review</h2>
              <span className={`status-pill ${review.level === "Excellent" || review.level === "Good" ? "ok" : "warn"}`}>
                {review.level}
              </span>
            </div>
            <img alt="Captured receipt preview" className="review-preview-image" src={review.previewUrl} />
            <p className="scan-review-score">
              <strong>{review.score}%</strong> data quality score
            </p>
            {review.duplicate && review.duplicate.confidence > 40 && (
              <div className={`duplicate-alert ${review.duplicate.isLikelyDuplicate ? "likely" : "possible"}`}>
                <p>
                  {review.duplicate.isLikelyDuplicate
                    ? "This receipt was likely already photographed."
                    : "This receipt may already exist."}{" "}
                  ({review.duplicate.confidence}% match)
                </p>
                {review.duplicate.reasons.length > 0 && (
                  <p className="muted">Signals: {review.duplicate.reasons.join(", ")}</p>
                )}
                {review.duplicate.matchedReceiptId && (
                  <p>
                    <Link to={`/receipts/${review.duplicate.matchedReceiptId}`}>Open similar receipt</Link>
                  </p>
                )}
              </div>
            )}
            <p className="muted">
              Detected {review.foundCount} of {review.totalCount} key fields.
            </p>
            {review.missingFields.length > 0 && (
              <p className="muted">Missing: {review.missingFields.slice(0, 5).join(", ")}{review.missingFields.length > 5 ? "..." : ""}</p>
            )}
            <div className="review-modal-actions">
              <Link className="ghost compact" to={`/receipts/${review.receiptId}`}>
                Open receipt
              </Link>
              <button className="danger compact" onClick={deleteUploadedReceipt} type="button">
                Delete receipt
              </button>
              <button className="compact" onClick={closeReview} type="button">
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
