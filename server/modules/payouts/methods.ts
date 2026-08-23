import { AppError } from "../../middleware/errors.js";

export type PayoutMethodType = "bank" | "paypal";

export type PayoutMethodRow = {
  id: string;
  type: string;
  details: unknown;
  is_default: boolean;
};

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePayoutMethodBody(body: unknown): { type: PayoutMethodType; details: Record<string, string> } {
  if (!isRecordValue(body)) {
    throw new AppError("validation_error", "Enter payout details", 400);
  }
  const type = body.type;
  if (type !== "bank" && type !== "paypal") {
    throw new AppError("validation_error", "Enter payout details", 400);
  }
  const raw = isRecordValue(body.details) ? body.details : {};
  if (type === "paypal") {
    const email = typeof raw.email === "string" ? raw.email.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!email || !name || !email.includes("@")) {
      throw new AppError("validation_error", "Enter payout details", 400);
    }
    return { type, details: { email, name } };
  }
  const account_name = typeof raw.account_name === "string" ? raw.account_name.trim() : "";
  const iban_or_account = typeof raw.iban_or_account === "string" ? raw.iban_or_account.trim() : "";
  if (!account_name || !iban_or_account) {
    throw new AppError("validation_error", "Enter payout details", 400);
  }
  return { type, details: { account_name, iban_or_account } };
}

function maskIban(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) return "••••";
  return `••••${compact.slice(-4)}`;
}

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "••••";
  return `${value.slice(0, 1)}•••${value.slice(at)}`;
}

export function maskPayoutMethodDetails(type: string, details: unknown): Record<string, string> {
  const raw = isRecordValue(details) ? details : {};
  if (type === "paypal") {
    return {
      name: typeof raw.name === "string" ? raw.name : "",
      email: maskEmail(typeof raw.email === "string" ? raw.email : ""),
    };
  }
  return {
    account_name: typeof raw.account_name === "string" ? raw.account_name : "",
    iban_or_account: maskIban(typeof raw.iban_or_account === "string" ? raw.iban_or_account : ""),
  };
}

export function serializePayoutMethod(row: PayoutMethodRow) {
  return {
    id: row.id,
    type: row.type,
    details: maskPayoutMethodDetails(row.type, row.details),
    is_default: row.is_default === true,
  };
}
