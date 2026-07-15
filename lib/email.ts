import nodemailer from 'nodemailer';
import {
  verificationEmailTemplate,
  resetPasswordEmailTemplate,
  mechanicResponseEmailTemplate,
  quoteStatusEmailTemplate,
} from './email-templates';

const APP_NAME = 'AviationHub';
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

// ── Transporter ──────────────────────────────────────────────────────────────
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    if (process.env.NODE_ENV === 'production') {
      console.error('SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)');
    }
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transporter;
}

function resolveFrom(): string {
  const from = process.env.SMTP_FROM?.trim();
  if (from && from.includes('@')) {
    return `${APP_NAME} <${from}>`;
  }
  const user = process.env.SMTP_USER?.trim();
  if (user && user.includes('@')) {
    return `${APP_NAME} <${user}>`;
  }
  return `${APP_NAME} <noreply@localhost>`;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  id?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/** Whether SMTP is configured — lets callers skip a batch of sends with one warning instead of one per recipient. */
export function isEmailConfigured(): boolean {
  return getTransporter() !== null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function sendMail(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
): Promise<SendEmailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: resolveFrom(),
      to,
      subject: `${subject} - ${APP_NAME}`,
      html,
      attachments,
    });

    return { success: true, id: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'SMTP send failed';
    console.error('SMTP error:', msg);
    return { success: false, error: msg };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function sendVerificationEmail(
  email: string,
  token: string,
  username: string,
): Promise<SendEmailResult> {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
  const html = verificationEmailTemplate(verifyUrl, username);
  return sendMail(email, 'Verify your email', html);
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  username: string,
): Promise<SendEmailResult> {
  const resetUrl = `${APP_URL}/desktop/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  const html = resetPasswordEmailTemplate(resetUrl, username);
  return sendMail(email, 'Reset your password', html);
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
): Promise<SendEmailResult> {
  return sendMail(to, subject, html, attachments);
}

export async function sendMechanicResponseEmail(
  to: string,
  listingTitle: string,
): Promise<SendEmailResult> {
  return sendMail(to, 'New mechanic response', mechanicResponseEmailTemplate(listingTitle));
}

export async function sendQuoteStatusEmail(
  to: string,
  listingTitle: string,
  status: string,
): Promise<SendEmailResult> {
  return sendMail(to, `Quote ${status.toLowerCase()}`, quoteStatusEmailTemplate(listingTitle, status));
}
