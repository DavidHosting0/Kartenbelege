import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import type { ParsedReceipt } from "../types.js";

dayjs.extend(customParseFormat);

const CARD_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: "Visa", regex: /\bv[\W_]*i[\W_]*s[\W_]*a\b/i },
  { type: "V Pay", regex: /\bv[\W_]*pay\b/i },
  { type: "Mastercard", regex: /\bmaster[\W_]*card\b|\beuro[\W_]*card\b/i },
  { type: "Maestro", regex: /\bmae[\W_]*stro\b/i },
  { type: "Amex", regex: /\bamex\b|\bamerican[\W_]*express\b/i },
  { type: "Discover", regex: /\bdiscover\b|\bdisc\b/i },
  { type: "Diners Club", regex: /\bdiners?[\W_]*club\b|\bdiners?\b/i },
  { type: "JCB", regex: /\bj[\W_]*c[\W_]*b\b|\bjapan[\W_]*credit[\W_]*bureau\b/i },
  { type: "UnionPay", regex: /\bunion[\W_]*pay\b|\bcup\b/i },
  { type: "MIR", regex: /\bmir\b/i },
  { type: "Troy", regex: /\btroy\b/i },
  { type: "Elo", regex: /\belo\b/i },
  { type: "Interac", regex: /\binterac\b/i },
  { type: "Bancontact", regex: /\bbancontact\b/i },
  { type: "Dankort", regex: /\bdankort\b/i },
  { type: "RuPay", regex: /\brupay\b/i },
  { type: "UATP", regex: /\buatp\b/i }
];

const CURRENCY_PATTERNS: Array<{ currency: string; regex: RegExp }> = [
  { currency: "EUR", regex: /\beur\b|€/i },
  { currency: "USD", regex: /\busd\b|\$/i },
  { currency: "GBP", regex: /\bgbp\b|£/i },
  { currency: "CHF", regex: /\bchf\b/i }
];

const DATE_FORMATS = [
  "DD.MM.YYYY",
  "DD/MM/YYYY",
  "DD-MM-YYYY",
  "DD.MM.YY",
  "DD/MM/YY",
  "DD-MM-YY",
  "YYYY-MM-DD",
  "YY-MM-DD",
  "MM/DD/YYYY",
  "MM/DD/YY"
];

const normalizeAmount = (raw: string): number | null => {
  let normalizedRaw = raw
    .replace(/[oO]/g, "0")
    .replace(/[sS]/g, "5")
    .replace(/[iIlL]/g, "1");
  if (!/[.,]\d{2}\b/.test(normalizedRaw) && /\b\d+\s+\d{2}\b/.test(normalizedRaw)) {
    normalizedRaw = normalizedRaw.replace(/\b(\d+)\s+(\d{2})\b/g, "$1.$2");
  }
  const cleaned = normalizedRaw.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
};

const cleanLabelValue = (value: string): string =>
  value
    .replace(/^[\s:.\-_|]+/, "")
    .replace(/[\s:.\-_|]+$/, "")
    .trim();

const compactToken = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

const normalizePanMasked = (value: string): string =>
  value
    .replace(/[^0-9xX*#]/g, "")
    .replace(/[xX]/g, "x");

const normalizeNumericToken = (value: string): string =>
  value
    .replace(/[oO]/g, "0")
    .replace(/[iIlL]/g, "1")
    .replace(/[sS]/g, "5")
    .replace(/[bB]/g, "8");

const normalizeCardTypeToken = (value: string): string =>
  value
    .replace(/[0oO]/g, "O")
    .replace(/[1iIlL]/g, "I")
    .replace(/[5sS]/g, "S");

const normalizeExpiry = (value: string | null): string | null => {
  if (!value) return null;
  const normalized = normalizeNumericToken(value);
  const compact = normalized.replace(/[^0-9]/g, "");
  if (compact.length === 4) {
    const month = Number(compact.slice(0, 2));
    if (month >= 1 && month <= 12) {
      return compact;
    }
  }
  const slashMatch = normalized.match(/\b([01]?\d)[\/-](\d{2,4})\b/);
  if (!slashMatch) return cleanLabelValue(value);
  const month = Number(slashMatch[1]);
  if (!(month >= 1 && month <= 12)) return cleanLabelValue(value);
  const yearRaw = slashMatch[2];
  const year2 = yearRaw.length >= 2 ? yearRaw.slice(-2) : yearRaw.padStart(2, "0");
  return `${String(month).padStart(2, "0")}${year2}`;
};

const LABEL_ALIASES = new Map<string, string>([
  ["DATE", "date"],
  ["PAN", "pan"],
  ["CARDEXRY", "cardExpiry"],
  ["CARDEXPY", "cardExpiry"],
  ["CARDEXPRY", "cardExpiry"],
  ["CARDEXPIRY", "cardExpiry"],
  ["CARDEXP", "cardExpiry"],
  ["CARDTYPE", "cardType"],
  ["CARDENTRY", "cardEntry"],
  ["AUTHCODE", "authCode"],
  ["TERMINALID", "terminalId"],
  ["TERMINAL10", "terminalId"],
  ["MERCHANTID", "merchantId"],
  ["MERCHANT10", "merchantId"],
  ["TRANSACTIONNO", "transactionNo"],
  ["TRANSACTIONN0", "transactionNo"],
  ["TRANSACTIONNUMBER", "transactionNo"],
  ["SALECURRENCY", "currency"],
  ["SALECURREHCY", "currency"],
  ["TOTALAMOUNT", "totalAmount"],
  ["AID", "aid"]
]);

const valueFromValueOnlyLine = (line: string): string | null => {
  const value = cleanLabelValue(line);
  return /[A-Za-z0-9]/.test(value) ? value : null;
};

const extractArticleText = (lines: string[]): string | null => {
  const stopIndex = lines.findIndex((line) =>
    /prizeotel|approved|date|sale|pan|card|auth|terminal|merchant|transaction|aid|total amount/i.test(line)
  );
  const headerLines = (stopIndex > 0 ? lines.slice(0, stopIndex) : lines.slice(0, 3)).map((line) => cleanLabelValue(line));
  for (const line of headerLines) {
    if (!line) continue;
    if (/tel|viktoriastrasse|bern city|^\d{4}\s+\w+/i.test(line)) continue;
    const hasLetter = /[A-Za-z]/.test(line);
    const hasDigit = /\d/.test(line);
    if (!hasLetter) continue;
    if (hasDigit || line.split(/\s+/).length >= 2) {
      return line.slice(0, 80);
    }
  }
  return null;
};

const interpretArticleText = (value: string | null): string | null => {
  if (!value) return null;
  const original = cleanLabelValue(value);
  if (!original) return null;

  const normalized = original.toUpperCase().replace(/[^A-Z0-9 ]/g, " ");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const roomMatch = original.match(/\b(\d{2,4})\b/);
  const roomNumber = roomMatch?.[1] ?? null;

  const isParking = tokens.some((token) => ["PARKING", "PARK", "PARM", "PAR", "PR", "PA"].includes(token));
  const isBreakfast = tokens.some((token) => ["BREAKFAST", "BB", "BR", "BD"].includes(token));

  if (!roomNumber && !isParking && !isBreakfast) {
    return original;
  }

  const parts: string[] = [];
  if (roomNumber) parts.push(`Room ${roomNumber}`);
  if (isParking) parts.push("Parking");
  if (isBreakfast) parts.push("Breakfast");

  return parts.join(" · ");
};

const extractMerchantName = (lines: string[]): string | null => {
  const head = lines.slice(0, 8).map((line) => cleanLabelValue(line));
  for (const line of head) {
    if (!line) continue;
    if (/^\d+$/.test(line)) continue;
    if (/tel|viktoriastrasse|approved|date|sale|pan|card|auth|terminal|merchant|transaction|aid|total amount/i.test(line)) {
      continue;
    }
    if (/[A-Za-z]{3,}/.test(line)) {
      return line.slice(0, 80);
    }
  }
  return null;
};

const digitsFromLine = (line: string): string => normalizeNumericToken(line).replace(/\D/g, "");

const extractTransactionNoFromBlock = (lines: string[]): string | null => {
  const txIdx = lines.findIndex((line) => /transaction\s*(?:no|number)/i.test(line));
  if (txIdx < 0) return null;
  for (let i = txIdx; i <= Math.min(txIdx + 4, lines.length - 1); i += 1) {
    const digits = digitsFromLine(lines[i]);
    if (digits.length >= 2 && digits.length <= 8) {
      return digits;
    }
  }
  return null;
};

const extractAidFromSplitBlock = (lines: string[]): string | null => {
  const aidIdx = lines.findIndex((line) => compactToken(line) === "AID");
  const txIdx = lines.findIndex((line) => /transaction\s*(?:no|number)/i.test(line));

  const searchStart = txIdx >= 0 ? txIdx : 0;
  const searchEnd = aidIdx >= 0 ? aidIdx : Math.min(lines.length - 1, searchStart + 8);
  let bestCandidate: string | null = null;

  for (let i = searchStart; i <= searchEnd; i += 1) {
    const digits = digitsFromLine(lines[i]);
    // AID on these receipts is usually a long numeric token, unlike terminal/merchant/tx numbers.
    if (digits.length >= 10 && (!bestCandidate || digits.length > bestCandidate.length)) {
      bestCandidate = digits;
    }
  }

  if (bestCandidate) return bestCandidate;

  if (aidIdx >= 0) {
    for (let i = Math.max(0, aidIdx - 3); i <= Math.min(lines.length - 1, aidIdx + 2); i += 1) {
      const digits = digitsFromLine(lines[i]);
      if (digits.length >= 10) return digits;
    }
  }
  return null;
};

const parseAmountLike = (value: string | null): number | null => {
  if (!value) return null;
  const normalized = normalizeNumericToken(value);
  if (!(/[.,]\d{2}\b/.test(normalized) || /\b\d+\s+\d{2}\b/.test(normalized))) {
    return null;
  }
  return normalizeAmount(normalized);
};

const extractAmountNearTotalLabel = (lines: string[]): number | null => {
  const totalIndices: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const token = compactToken(lines[i]);
    if (token.includes("TOTALAMOUNT") || token === "TOTAL" || token === "AMOUNT") {
      totalIndices.push(i);
    }
  }

  for (const idx of totalIndices) {
    for (let i = idx; i <= Math.min(lines.length - 1, idx + 8); i += 1) {
      const parsed = parseAmountLike(lines[i]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
};

const extractStandaloneAmount = (lines: string[]): number | null => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^\s*\d+[.,]\d{2}\s*$/.test(lines[i]) || /^\s*\d+\s+\d{2}\s*$/.test(lines[i])) {
      const parsed = normalizeAmount(lines[i]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
};

const parseLabeledFields = (lines: string[]): Map<string, string> => {
  const fields = new Map<string, string>();
  const labelQueue: string[] = [];

  for (const line of lines) {
    const inlineMatch = line.match(/^\s*([A-Za-z][A-Za-z0-9 \-]*?)(?:\s*[.:]{1,}|\s{2,})(.*)$/);
    if (inlineMatch) {
      const rawLabel = compactToken(inlineMatch[1]);
      const key = LABEL_ALIASES.get(rawLabel);
      const rawValue = cleanLabelValue(inlineMatch[2]);
      if (key && rawValue && !fields.has(key)) {
        fields.set(key, rawValue);
        continue;
      }
    }

    const token = compactToken(line);
    const explicitKey = LABEL_ALIASES.get(token);
    if (explicitKey) {
      labelQueue.push(explicitKey);
      continue;
    }

    const valueOnly = valueFromValueOnlyLine(line);
    if (!valueOnly) continue;
    if (labelQueue.length > 0) {
      const key = labelQueue.shift()!;
      if (!fields.has(key)) {
        fields.set(key, valueOnly);
      }
    }
  }

  return fields;
};

const firstMatch = (lines: string[], patterns: RegExp[]): string | null => {
  for (const pattern of patterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      const value = cleanLabelValue(match?.[1] ?? "");
      if (value) {
        return value;
      }
    }
  }
  return null;
};

const parseCardTypeFromLine = (line: string): string | null => {
  for (const card of CARD_PATTERNS) {
    if (card.regex.test(line)) {
      return card.type;
    }
  }
  return null;
};

const parseDateAndTime = (text: string): { transactionDate: string | null; transactionTime: string | null } => {
  const dateLineMatch = text.match(
    /DATE[^\d]*([0-3]?\d[./-][01]?\d[./-](?:\d{2}|\d{4}))(?:\s+([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)?/i
  );
  const dateCandidate = dateLineMatch?.[1] ?? text.match(/\b(\d{2}[./-]\d{2}[./-](?:\d{2}|\d{4})|\d{4}[./-]\d{2}[./-]\d{2})\b/)?.[1] ?? null;
  const transactionDate = dateCandidate
    ? DATE_FORMATS.map((format) => dayjs(dateCandidate, format, true))
        .find((parsed) => parsed.isValid())
        ?.format("YYYY-MM-DD") ?? null
    : null;

  const transactionTime =
    dateLineMatch?.[2] ??
    text.match(/\b([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?\b/)?.[0] ??
    null;

  return { transactionDate, transactionTime };
};

const parseDateAndTimeFromValue = (value: string | null): { transactionDate: string | null; transactionTime: string | null } => {
  if (!value) {
    return { transactionDate: null, transactionTime: null };
  }
  const normalizedValue = normalizeNumericToken(value).replace(/;/g, ":");
  const dateCandidate = normalizedValue.match(/\b([0-3]?\d[./-][01]?\d[./-](?:\d{2}|\d{4})|\d{4}[./-]\d{2}[./-]\d{2})\b/)?.[1] ?? null;
  const transactionDate = dateCandidate
    ? DATE_FORMATS.map((format) => dayjs(dateCandidate, format, true))
        .find((parsed) => parsed.isValid())
        ?.format("YYYY-MM-DD") ?? null
    : null;
  const transactionTime = normalizedValue.match(/\b([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?\b/)?.[0] ?? null;
  return { transactionDate, transactionTime };
};

export const parseReceiptText = (rawText: string): ParsedReceipt => {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const text = lines.join("\n");
  const labeled = parseLabeledFields(lines);
  const articleText = interpretArticleText(extractArticleText(lines));
  const merchantName = extractMerchantName(lines);

  const panMaskedFromLabel = labeled.get("pan") ? normalizePanMasked(labeled.get("pan")!) : null;
  const panMaskedFallback = firstMatch(lines, [
    /pan(?:\s*no)?\b[\s:.\-_|]*([0-9xX*#\-\s]{8,})/i,
    /card(?:\s*no)?\b[\s:.\-_|]*([0-9xX*#\-\s]{8,})/i
  ]);
  const panTailFromLooseLine =
    lines.find((line) => /^\s*[<({\[]?\s*\d{4}\s*$/.test(line))?.match(/(\d{4})/)?.[1] ?? null;
  const panCandidate = panMaskedFromLabel ?? (panMaskedFallback ? normalizePanMasked(panMaskedFallback) : null);
  const normalizedPanMasked =
    panCandidate && !/\d{4}$/.test(panCandidate) && panTailFromLooseLine
      ? `${panCandidate}${"x".repeat(6)}${panTailFromLooseLine}`
      : panCandidate;
  const cardExpiryRaw = labeled.get("cardExpiry") ?? firstMatch(lines, [
    /card\s*(?:exp|expry|exry|expiry)\b[\s:.\-_|]*([0-9]{2,4}(?:[\/-][0-9]{2,4})?)/i
  ]);
  const cardExpiry = normalizeExpiry(cardExpiryRaw);
  const cardEntry = labeled.get("cardEntry") ?? firstMatch(lines, [
    /card\s*entry\b[\s:.\-_|]*([a-z0-9\-\/ ]{2,})/i
  ]);
  const authCode = labeled.get("authCode") ?? firstMatch(lines, [
    /auth\s*code\b[\s:.\-_|]*([a-z0-9\-]+)/i
  ]);
  const terminalId = labeled.get("terminalId") ?? firstMatch(lines, [
    /terminal\s*id\b[\s:.\-_|]*([a-z0-9\-]+)/i
  ]);
  const merchantId = labeled.get("merchantId") ?? firstMatch(lines, [
    /merchant\s*id\b[\s:.\-_|]*([a-z0-9\-]+)/i
  ]);
  const transactionNoRaw = labeled.get("transactionNo") ?? firstMatch(lines, [
    /transaction\s*no\b[\s:.\-_|]*([a-z0-9\-]+)/i
  ]);
  const transactionNoNormalized = transactionNoRaw ? digitsFromLine(transactionNoRaw) || cleanLabelValue(transactionNoRaw) : null;
  const transactionNo = transactionNoNormalized ?? extractTransactionNoFromBlock(lines);

  const aidRaw = labeled.get("aid") ?? firstMatch(lines, [
    /\baid\b[\s:.\-_|]*([a-z0-9\-]+)/i
  ]);
  const aidNormalized = aidRaw ? digitsFromLine(aidRaw) || cleanLabelValue(aidRaw) : null;
  const aidFromSplitBlock = extractAidFromSplitBlock(lines);
  const aid =
    aidFromSplitBlock ??
    (aidNormalized && aidNormalized !== "0" ? aidNormalized : null) ??
    null;

  const cardTypeFromLabel =
    labeled.get("cardType") ??
    firstMatch(lines, [
      /card\s*type\b[\s:.\-_|]*([a-z0-9 \-\/]+)/i
    ]) ?? "";
  const normalizedCardTypeFromLabel = normalizeCardTypeToken(cardTypeFromLabel);
  const cardType = parseCardTypeFromLine(normalizedCardTypeFromLabel) ?? CARD_PATTERNS.find((pattern) => pattern.regex.test(text))?.type ?? null;

  const dateFromLabel = parseDateAndTimeFromValue(labeled.get("date") ?? null);
  const dateFallback = parseDateAndTime(text);
  const transactionDate = dateFromLabel.transactionDate ?? dateFallback.transactionDate;
  const transactionTime = dateFromLabel.transactionTime ?? dateFallback.transactionTime;

  const currencyFromLabel = labeled.get("currency") ?? lines
    .find((line) => /sale\s*currency/i.test(line))
    ?.replace(/.*sale\s*currency[\s.:_-]*/i, "")
    .trim() ?? "";
  const currencyFromCode = currencyFromLabel.match(/\b([A-Z]{3})\b/i)?.[1]?.toUpperCase() ?? null;
  const currency = currencyFromCode ?? CURRENCY_PATTERNS.find((pattern) => pattern.regex.test(text))?.currency ?? null;

  const totalAmountFromLabel = parseAmountLike(labeled.get("totalAmount") ?? null);
  const totalAmountFromContext = extractAmountNearTotalLabel(lines);

  const amountRegexes = [
    /total\s*amount[^\d]*([0-9]+(?:[.,][0-9]{2}))/gi,
    /(?:total|betrag|amount|summe)\s*[:\-]?\s*([A-Z]{3}\s*)?([0-9]+(?:[.,][0-9]{2}))/gi,
    /([A-Z]{3}\s*)?([0-9]+(?:[.,][0-9]{2}))\s*(?:EUR|USD|GBP|CHF|€|\$|£)/gi
  ];
  const amounts: number[] = [];

  for (const regex of amountRegexes) {
    let match = regex.exec(text);
    while (match) {
      const amountGroup = match[2] ?? match[1];
      const parsed = amountGroup ? normalizeAmount(amountGroup) : null;
      if (parsed !== null) {
        amounts.push(parsed);
      }
      match = regex.exec(text);
    }
  }

  const amount =
    totalAmountFromLabel ??
    totalAmountFromContext ??
    (amounts.length ? Math.max(...amounts) : null) ??
    extractStandaloneAmount(lines);

  const cardLast4 = normalizedPanMasked?.match(/(\d{4})$/)?.[1] ??
    panTailFromLooseLine ??
    text.match(/pan[^\d]*(?:\d|x|X|\*|#|[-\s])*(\d{4})\b/i)?.[1] ??
    text.match(/(?:\b(?:card|karte|pan)\b.*?)(\d{4})\b/i)?.[1] ??
    text.match(/\b(?:\*{2,}|x{2,}|#{2,}|\d{4}[-\s])(?:\d{4}[-\s])?(?:\d{4}[-\s])?(\d{4})\b/i)?.[1] ??
    null;

  return {
    articleText,
    merchantName,
    cardType,
    panMasked: normalizedPanMasked,
    cardExpiry,
    cardEntry,
    transactionDate,
    transactionTime,
    amount,
    currency,
    cardLast4,
    authCode,
    terminalId,
    merchantId,
    transactionNo,
    aid
  };
};
