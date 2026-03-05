import { useEffect, useRef, useState } from "react";
import { AppNav } from "../components/AppNav";
import { uploadReceiptImage } from "../api/client";

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
    try {
      await uploadReceiptImage(blob);
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
    </main>
  );
};
