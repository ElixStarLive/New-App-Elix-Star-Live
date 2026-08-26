import nodemailer from "nodemailer";
import { logger } from "./logger.js";

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const url = process.env.SMTP_URL?.trim();
  if (!url) {
    logger.info({ to, subject }, "mail skipped because SMTP_URL is not set");
    return;
  }
  const transporter = nodemailer.createTransport({
    url,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 5_000,
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM?.trim() || "noreply@elixstarlive.app",
    to,
    subject,
    text,
  });
}
