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
    score: number;
    level: "Excellent" | "Good" | "Fair" | "Needs Review";
    foundCount: number;
    totalCount: number;
    missingFields: string[];
  } | null>(null);

  const hasValue = (value: string | number | null | undefined) =>
    value !== null && value !== undefined && String(value).trim().length > 0;

  const buildReview = (result: UploadReceiptResponse) => {
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
      score,
      level,
      foundCount,
      totalCount: checks.length,
      missingFields
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
    setBusy(true);
    setStatus("Uploading and processing OCR...");
    setError(null);
    setReview(null);
    try {
      const result = await uploadReceiptImage(blob);
      setReview(buildReview(result));
      setStatus("Receipt processed and saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("Capture failed");
    } finally {
      setBusy(false);
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
        <section className="card scan-review">
          <div className="scan-review-head">
            <h2>Data Quality Check</h2>
            <span className={`status-pill ${review.level === "Excellent" || review.level === "Good" ? "ok" : "warn"}`}>
              {review.level}
            </span>
          </div>
          <p className="scan-review-score">
            <strong>{review.score}%</strong> confidence based on parsed field completeness.
          </p>
          <p className="muted">
            Detected {review.foundCount} of {review.totalCount} key fields.
          </p>
          {review.missingFields.length > 0 && (
            <p className="muted">Missing: {review.missingFields.slice(0, 5).join(", ")}{review.missingFields.length > 5 ? "..." : ""}</p>
          )}
          <p>
            <Link to={`/receipts/${review.receiptId}`}>Open receipt details</Link>
          </p>
        </section>
      )}
    </main>
  );
};
