import nodemailer from "nodemailer";
import { logger } from "./logger.js";

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const url = process.env.SMTP_URL?.trim();
  if (!url) {
    logger.info({ to, subject }, "mail skipped because SMTP_URL is not set");
    return;
  }
  const transporter = nodemailer.createTransport(url);
  await transporter.sendMail({
    from: process.env.MAIL_FROM?.trim() || "noreply@elixstarlive.app",
    to,
    subject,
    text,
  });
}
