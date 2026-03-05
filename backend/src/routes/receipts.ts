import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import ExcelJS from "exceljs";
import { db } from "../config/database.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { compressForStorage } from "../services/imageService.js";
import { extractTextFromImage } from "../services/ocrService.js";
import { parseReceiptText } from "../services/parserService.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

export const receiptRouter = Router();

receiptRouter.use(requireAuth);

const scopedWhere = (user: { id: string; role: "admin" | "user" }, extra: string[] = []) => {
  const clauses = [...extra];
  const values: Array<string | number> = [];
  if (user.role !== "admin") {
    clauses.unshift("user_id = ?");
    values.push(user.id);
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values
  };
};

type DuplicateCandidate = {
  id: string;
  amount: number | null;
  transaction_date: string | null;
  card_last4: string | null;
  terminal_id: string | null;
  merchant_id: string | null;
  auth_code: string | null;
  transaction_no: string | null;
  pan_masked: string | null;
};

const normToken = (value: string | null | undefined): string =>
  (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const normDigits = (value: string | null | undefined): string =>
  (value ?? "").replace(/\D/g, "");

const amountsClose = (a: number | null | undefined, b: number | null | undefined): boolean =>
  a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(a - b) <= 0.01;

const buildDuplicateFeedback = (
  parsed: {
    amount: number | null;
    transactionDate: string | null;
    cardLast4: string | null;
    terminalId: string | null;
    merchantId: string | null;
    authCode: string | null;
    transactionNo: string | null;
    panMasked: string | null;
  },
  candidates: DuplicateCandidate[]
) => {
  let best:
    | {
      id: string;
      score: number;
      reasons: string[];
    }
    | null = null;

  for (const candidate of candidates) {
    let score = 0;
    const reasons: string[] = [];

    const txNoMatch =
      parsed.transactionNo &&
      candidate.transaction_no &&
      normDigits(parsed.transactionNo) !== "" &&
      normDigits(parsed.transactionNo) === normDigits(candidate.transaction_no);
    if (txNoMatch) {
      score += 60;
      reasons.push("same transaction number");
    }

    const authMatch =
      parsed.authCode &&
      candidate.auth_code &&
      normDigits(parsed.authCode) !== "" &&
      normDigits(parsed.authCode) === normDigits(candidate.auth_code);
    if (authMatch) {
      score += 30;
      reasons.push("same auth code");
    }

    const terminalMatch =
      parsed.terminalId &&
      candidate.terminal_id &&
      normDigits(parsed.terminalId) !== "" &&
      normDigits(parsed.terminalId) === normDigits(candidate.terminal_id);
    if (terminalMatch) {
      score += 20;
      reasons.push("same terminal ID");
    }

    const merchantMatch =
      parsed.merchantId &&
      candidate.merchant_id &&
      normDigits(parsed.merchantId) !== "" &&
      normDigits(parsed.merchantId) === normDigits(candidate.merchant_id);
    if (merchantMatch) {
      score += 20;
      reasons.push("same merchant ID");
    }

    const last4Match =
      parsed.cardLast4 &&
      candidate.card_last4 &&
      normDigits(parsed.cardLast4).length === 4 &&
      normDigits(parsed.cardLast4) === normDigits(candidate.card_last4);
    if (last4Match) {
      score += 15;
      reasons.push("same card last 4");
    }

    const dateMatch =
      parsed.transactionDate &&
      candidate.transaction_date &&
      parsed.transactionDate === candidate.transaction_date;
    if (dateMatch) {
      score += 10;
      reasons.push("same transaction date");
    }

    if (amountsClose(parsed.amount, candidate.amount)) {
      score += 5;
      reasons.push("same amount");
    }

    const panMatch =
      parsed.panMasked &&
      candidate.pan_masked &&
      normToken(parsed.panMasked).length >= 10 &&
      normToken(parsed.panMasked) === normToken(candidate.pan_masked);
    if (panMatch) {
      score += 20;
      reasons.push("same masked card number");
    }

    if (txNoMatch && terminalMatch && dateMatch) {
      score += 25;
      reasons.push("same terminal + transaction combination");
    }
    if (authMatch && terminalMatch && amountsClose(parsed.amount, candidate.amount)) {
      score += 20;
      reasons.push("same auth + terminal + amount");
    }

    score = Math.min(score, 100);
    if (!best || score > best.score) {
      best = { id: candidate.id, score, reasons };
    }
  }

  if (!best || best.score < 50) {
    const fallbackScore = best ? best.score : 0;
    const fallbackReasons = best ? best.reasons.slice(0, 3) : [];
    return {
      isLikelyDuplicate: false,
      level: "none" as const,
      confidence: fallbackScore,
      matchedReceiptId: null,
      reasons: fallbackReasons
    };
  }

  if (best.score >= 70) {
    return {
      isLikelyDuplicate: true,
      level: "likely" as const,
      confidence: best.score,
      matchedReceiptId: best.id,
      reasons: best.reasons.slice(0, 4)
    };
  }

  return {
    isLikelyDuplicate: false,
    level: "possible" as const,
    confidence: best.score,
    matchedReceiptId: best.id,
    reasons: best.reasons.slice(0, 4)
  };
};

receiptRouter.post("/", upload.single("receiptImage"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const userId = req.user!.id;
    const receiptId = uuidv4();

    // Send original full-resolution upload to Vision OCR for best text fidelity.
    const rawText = await extractTextFromImage(req.file.buffer);
    console.log(`OCR text for receipt ${receiptId}:\n${rawText}\n--- end OCR text ---`);
    if (!rawText.trim()) {
      return res.status(422).json({ error: "OCR did not detect readable text" });
    }

    const parsed = parseReceiptText(rawText);
    const duplicateScope = scopedWhere(req.user!, ["created_at >= datetime('now', '-180 days')"]);
    const duplicateCandidates = db
      .prepare(
        `SELECT id, amount, transaction_date, card_last4, terminal_id, merchant_id, auth_code, transaction_no, pan_masked
         FROM receipts
         ${duplicateScope.sql}
         ORDER BY created_at DESC
         LIMIT 800`
      )
      .all(...duplicateScope.values) as DuplicateCandidate[];

    const duplicateCheck = buildDuplicateFeedback(parsed, duplicateCandidates);
    const compressedImage = await compressForStorage(req.file.buffer);

    const userDir = path.resolve("uploads", "receipts", userId);
    fs.mkdirSync(userDir, { recursive: true });
    const imagePath = path.join(userDir, `${receiptId}.jpg`);
    fs.writeFileSync(imagePath, compressedImage);

    db.prepare(
      `INSERT INTO receipts (
        id, user_id, article_text, merchant_name, card_type, pan_masked, card_expiry, card_entry, amount, currency,
        transaction_date, transaction_time, card_last4, auth_code, terminal_id, merchant_id,
        transaction_no, aid, raw_ocr_text, image_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      receiptId,
      userId,
      parsed.articleText,
      parsed.merchantName,
      parsed.cardType,
      parsed.panMasked,
      parsed.cardExpiry,
      parsed.cardEntry,
      parsed.amount,
      parsed.currency,
      parsed.transactionDate,
      parsed.transactionTime,
      parsed.cardLast4,
      parsed.authCode,
      parsed.terminalId,
      parsed.merchantId,
      parsed.transactionNo,
      parsed.aid,
      rawText,
      imagePath
    );

    return res.status(201).json({
      id: receiptId,
      ...parsed,
      duplicateCheck
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Receipt processing failed" });
  }
});

receiptRouter.get("/", (req, res) => {
  const amount = req.query.amount ? Number(req.query.amount) : null;
  const last4 = typeof req.query.last4 === "string" ? req.query.last4 : null;
  const date = typeof req.query.date === "string" ? req.query.date : null;

  const where: string[] = [];
  const values: Array<string | number> = [];
  if (req.user!.role !== "admin") {
    where.push("user_id = ?");
    values.push(req.user!.id);
  }

  if (amount !== null && Number.isFinite(amount)) {
    where.push("amount = ?");
    values.push(amount);
  }
  if (last4) {
    where.push("card_last4 = ?");
    values.push(last4);
  }
  if (date) {
    where.push("transaction_date = ?");
    values.push(date);
  }

  const rows = db
    .prepare(
      `SELECT id, article_text, card_type, amount, currency, transaction_date, transaction_time, card_last4, merchant_name, created_at
       FROM receipts
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT 500`
    )
    .all(...values) as Array<{
      id: string;
      article_text: string | null;
      card_type: string | null;
      amount: number | null;
      currency: string | null;
      transaction_date: string | null;
      transaction_time: string | null;
      card_last4: string | null;
      merchant_name: string | null;
      created_at: string;
    }>;

  res.json({
    receipts: rows.map((row) => ({
      ...row,
      imageUrl: `/api/receipts/${row.id}/image`
    }))
  });
});

receiptRouter.get("/analytics", (req, res) => {
  const scope = scopedWhere(req.user!);
  const summaryRow = db
    .prepare(
      `SELECT 
         COUNT(*) as total_receipts,
         COALESCE(SUM(amount), 0) as total_amount,
         COALESCE(AVG(amount), 0) as average_amount,
         SUM(CASE
             WHEN amount IS NOT NULL
              AND card_type IS NOT NULL
              AND card_last4 IS NOT NULL
              AND transaction_date IS NOT NULL
             THEN 1 ELSE 0 END) as verified_count
       FROM receipts
       ${scope.sql}`
    )
    .get(...scope.values) as {
    total_receipts: number;
    total_amount: number;
    average_amount: number;
    verified_count: number;
  };

  const monthScope = scopedWhere(req.user!, [
    "transaction_date IS NOT NULL",
    "transaction_date >= date('now', 'start of month', '-5 months')"
  ]);
  const monthlyRows = db
    .prepare(
      `SELECT
         substr(transaction_date, 1, 7) as month,
         COUNT(*) as count,
         COALESCE(SUM(amount), 0) as total_amount
       FROM receipts
       ${monthScope.sql}
       GROUP BY month
       ORDER BY month ASC`
    )
    .all(...monthScope.values) as Array<{ month: string; count: number; total_amount: number }>;

  const cardScope = scopedWhere(req.user!, ["card_type IS NOT NULL"]);
  const cardRows = db
    .prepare(
      `SELECT
         card_type as card_type,
         COUNT(*) as count,
         COALESCE(SUM(amount), 0) as total_amount
       FROM receipts
       ${cardScope.sql}
       GROUP BY card_type
       ORDER BY count DESC
       LIMIT 8`
    )
    .all(...cardScope.values) as Array<{ card_type: string; count: number; total_amount: number }>;

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthReceipts = monthlyRows.find((row) => row.month === thisMonth)?.count ?? 0;
  const verifiedCount = summaryRow.verified_count ?? 0;
  const totalReceipts = summaryRow.total_receipts ?? 0;

  res.json({
    summary: {
      totalReceipts,
      totalAmount: Number(summaryRow.total_amount ?? 0),
      averageAmount: Number(summaryRow.average_amount ?? 0),
      receiptsThisMonth: thisMonthReceipts,
      verifiedCount,
      needsReviewCount: Math.max(0, totalReceipts - verifiedCount)
    },
    monthly: monthlyRows.map((row) => ({
      month: row.month,
      count: row.count,
      totalAmount: Number(row.total_amount ?? 0)
    })),
    cardTypes: cardRows.map((row) => ({
      cardType: row.card_type,
      count: row.count,
      totalAmount: Number(row.total_amount ?? 0)
    }))
  });
});

receiptRouter.get("/export.xlsx", async (req, res) => {
  const scope = scopedWhere(req.user!);
  const rows = db
    .prepare(
      `SELECT id, user_id, article_text, merchant_name, amount, currency, transaction_date, transaction_time,
              card_type, card_last4, pan_masked, card_expiry, card_entry, auth_code, terminal_id, merchant_id,
              transaction_no, aid, image_path, created_at
       FROM receipts
       ${scope.sql}
       ORDER BY created_at DESC`
    )
    .all(...scope.values) as Array<{
    id: string;
    user_id: string;
    article_text: string | null;
    merchant_name: string | null;
    amount: number | null;
    currency: string | null;
    transaction_date: string | null;
    transaction_time: string | null;
    card_type: string | null;
    card_last4: string | null;
    pan_masked: string | null;
    card_expiry: string | null;
    card_entry: string | null;
    auth_code: string | null;
    terminal_id: string | null;
    merchant_id: string | null;
    transaction_no: string | null;
    aid: string | null;
    image_path: string;
    created_at: string;
  }>;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Prize Receipt Suite";
  workbook.created = new Date();
  const columns: Array<Partial<ExcelJS.Column>> = [
    { header: "Photo", key: "photo", width: 13 },
    { header: "Receipt Note", key: "article_text", width: 26 },
    { header: "Date & Time", key: "date_time", width: 20 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Card Type", key: "card_type", width: 16 },
    { header: "Last 4", key: "card_last4", width: 10 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Masked Card Number", key: "pan_masked", width: 22 },
    { header: "Card Expiry", key: "card_expiry", width: 12 },
    { header: "Card Entry", key: "card_entry", width: 14 },
    { header: "Auth Code", key: "auth_code", width: 14 },
    { header: "Terminal ID", key: "terminal_id", width: 14 },
    { header: "Merchant ID", key: "merchant_id", width: 14 },
    { header: "Transaction No", key: "transaction_no", width: 16 },
    { header: "AID", key: "aid", width: 20 },
    { header: "Created At", key: "created_at", width: 22 }
  ];

  const monthGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const monthKey =
      (row.transaction_date && /^\d{4}-\d{2}/.test(row.transaction_date) ? row.transaction_date.slice(0, 7) : null) ??
      (row.created_at && /^\d{4}-\d{2}/.test(row.created_at) ? row.created_at.slice(0, 7) : null) ??
      "Unknown";
    const group = monthGroups.get(monthKey);
    if (group) {
      group.push(row);
    } else {
      monthGroups.set(monthKey, [row]);
    }
  }

  const monthKeys = [...monthGroups.keys()].sort((a, b) => (a < b ? 1 : -1));
  if (monthKeys.length === 0) {
    monthKeys.push("No Receipts");
    monthGroups.set("No Receipts", []);
  }

  for (const monthKey of monthKeys) {
    const safeSheetName = monthKey.slice(0, 31);
    const sheet = workbook.addWorksheet(safeSheetName, {
      views: [{ state: "frozen", ySplit: 1 }]
    });
    sheet.columns = columns as ExcelJS.Column[];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: "middle" };
    sheet.getRow(1).height = 22;

    const monthRows = monthGroups.get(monthKey) ?? [];
    monthRows.forEach((row) => {
      const dateTime = [row.transaction_date, row.transaction_time].filter(Boolean).join(" ");
      const amount = row.amount !== null ? `${row.amount.toFixed(2)} ${row.currency ?? ""}`.trim() : "";
      const excelRow = sheet.addRow({
        photo: "",
        article_text: row.article_text ?? "",
        date_time: dateTime,
        amount,
        card_type: row.card_type ?? "",
        card_last4: row.card_last4 ?? "",
        currency: row.currency ?? "",
        pan_masked: row.pan_masked ?? "",
        card_expiry: row.card_expiry ?? "",
        card_entry: row.card_entry ?? "",
        auth_code: row.auth_code ?? "",
        terminal_id: row.terminal_id ?? "",
        merchant_id: row.merchant_id ?? "",
        transaction_no: row.transaction_no ?? "",
        aid: row.aid ?? "",
        created_at: row.created_at
      });
      excelRow.height = 68;

      if (row.image_path && fs.existsSync(row.image_path)) {
        const ext = path.extname(row.image_path).replace(".", "").toLowerCase();
        if (ext === "jpg" || ext === "jpeg" || ext === "png") {
          const imageId = workbook.addImage({
            filename: row.image_path,
            extension: ext === "png" ? "png" : "jpeg"
          });
          sheet.addImage(imageId, {
            tl: { col: 0.15, row: excelRow.number - 0.9 },
            ext: { width: 48, height: 64 }
          });
        }
      }
    });
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="receipts-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

receiptRouter.get("/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT id, user_id, article_text, merchant_name, card_type, pan_masked, card_expiry, card_entry, amount, currency, transaction_date, transaction_time,
              card_last4, auth_code, terminal_id, merchant_id, transaction_no, aid, raw_ocr_text, created_at
       FROM receipts WHERE id = ?`
    )
    .get(req.params.id) as any;

  if (!row || (req.user!.role !== "admin" && row.user_id !== req.user!.id)) {
    return res.status(404).json({ error: "Receipt not found" });
  }

  return res.json({
    ...row,
    imageUrl: `/api/receipts/${row.id}/image`
  });
});

receiptRouter.get("/:id/image", (req, res) => {
  const row = db.prepare("SELECT user_id, image_path FROM receipts WHERE id = ?").get(req.params.id) as
    | { user_id: string; image_path: string }
    | undefined;
  if (!row || (req.user!.role !== "admin" && row.user_id !== req.user!.id)) {
    return res.status(404).json({ error: "Image not found" });
  }
  if (!fs.existsSync(row.image_path)) {
    return res.status(404).json({ error: "Stored image file missing" });
  }
  return res.sendFile(path.resolve(row.image_path));
});

receiptRouter.delete("/:id/recent-delete", (req, res) => {
  const row = db
    .prepare("SELECT id, user_id, image_path, created_at FROM receipts WHERE id = ?")
    .get(req.params.id) as
    | { id: string; user_id: string; image_path: string; created_at: string }
    | undefined;

  if (!row) {
    return res.status(404).json({ error: "Receipt not found" });
  }

  const isAdmin = req.user!.role === "admin";
  const isOwner = row.user_id === req.user!.id;
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: "Not allowed to delete this receipt" });
  }

  // Keep this endpoint scoped to freshly-uploaded receipts for non-admin users.
  if (!isAdmin) {
    const createdAt = new Date(row.created_at.replace(" ", "T") + "Z").getTime();
    const maxAgeMs = 15 * 60 * 1000;
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > maxAgeMs) {
      return res.status(403).json({ error: "Quick delete expired for this receipt" });
    }
  }

  db.prepare("DELETE FROM receipts WHERE id = ?").run(req.params.id);
  if (fs.existsSync(row.image_path)) {
    fs.unlinkSync(row.image_path);
  }

  return res.json({ ok: true });
});

receiptRouter.delete("/:id", requireAdmin, (req, res) => {
  const row = db.prepare("SELECT id, image_path FROM receipts WHERE id = ?").get(req.params.id) as
    | { id: string; image_path: string }
    | undefined;
  if (!row) {
    return res.status(404).json({ error: "Receipt not found" });
  }

  db.prepare("DELETE FROM receipts WHERE id = ?").run(req.params.id);
  if (fs.existsSync(row.image_path)) {
    fs.unlinkSync(row.image_path);
  }

  res.json({ ok: true });
});
