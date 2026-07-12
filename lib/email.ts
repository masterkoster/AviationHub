import { Resend } from 'resend';
import { 
  verificationEmailTemplate, 
  resetPasswordEmailTemplate,
  mechanicResponseEmailTemplate,
  quoteStatusEmailTemplate,
} from './email-templates';

const resendApiKey = process.env.RESEND_API_KEY;

// Constructed lazily: Resend throws when instantiated without a key, which
// would crash module evaluation (and `next build`) in environments where
// email isn't configured. Callers already guard on resendApiKey.
let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) resendClient = new Resend(resendApiKey);
  return resendClient;
}

const APP_NAME = 'AviationHub';
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

function resolveFromAddress(): { ok: true; from: string } | { ok: false; error: string } {
  const fromEnv = process.env.RESEND_FROM?.trim();
  if (fromEnv) {
    const normalized = fromEnv.replace(/[\r\n]+/g, '');
    if (normalized.includes('@')) {
      if (process.env.NODE_ENV === 'production' && /@resend\.dev\b/i.test(normalized)) {
        return { ok: false, error: 'RESEND_FROM must use your verified domain (not resend.dev)' };
      }
      return { ok: true, from: normalized };
    }
  }

  const domain = process.env.RESEND_DOMAIN?.trim();
  if (domain) {
    const normalizedDomain = domain.replace(/^https?:\/\//i, '').replace(/\s+/g, '');
    const from = `${APP_NAME} <noreply@${normalizedDomain}>`;
    if (process.env.NODE_ENV === 'production' && /@resend\.dev\b/i.test(from)) {
      return { ok: false, error: 'RESEND_DOMAIN must be your verified domain (not resend.dev)' };
    }
    return { ok: true, from };
  }

  if (process.env.NODE_ENV === 'production') {
    return { ok: false, error: 'Sender not configured (set RESEND_FROM or RESEND_DOMAIN)' };
  }

  // Resend default sender for local/dev testing.
  return { ok: true, from: `${APP_NAME} <onboarding@resend.dev>` };
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  id?: string;
}

/**
 * Send a verification email to a new user
 */
export async function sendVerificationEmail(
  email: string, 
  token: string,
  username: string
): Promise<SendEmailResult> {
  // Link to API endpoint which verifies then redirects to success page
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
  
  try {
    if (!resendApiKey) {
      return { success: false, error: 'Email service not configured' };
    }

    const fromResolved = resolveFromAddress();
    if (!fromResolved.ok) {
      return { success: false, error: fromResolved.error };
    }

    const { data, error } = await getResend().emails.send({
      from: fromResolved.from,
      to: email,
      subject: `Verify your email - ${APP_NAME}`,
      html: verificationEmailTemplate(verifyUrl, username),
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Failed to send verification email:', err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(
  email: string, 
  token: string,
  username: string
): Promise<SendEmailResult> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  
  try {
    if (!resendApiKey) {
      return { success: false, error: 'Email service not configured' };
    }

    const fromResolved = resolveFromAddress();
    if (!fromResolved.ok) {
      return { success: false, error: fromResolved.error };
    }

    const { data, error } = await getResend().emails.send({
      from: fromResolved.from,
      to: email,
      subject: `Reset your password - ${APP_NAME}`,
      html: resetPasswordEmailTemplate(resetUrl, username),
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Failed to send password reset email:', err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

/**
 * Generic send email function for future use
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<SendEmailResult> {
  try {
    if (!resendApiKey) {
      return { success: false, error: 'Email service not configured' };
    }

    const fromResolved = resolveFromAddress();
    if (!fromResolved.ok) {
      return { success: false, error: fromResolved.error };
    }

    const { data, error } = await getResend().emails.send({
      from: fromResolved.from,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Failed to send email:', err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

export async function sendMechanicResponseEmail(
  to: string,
  listingTitle: string
): Promise<SendEmailResult> {
  return sendEmail(
    to,
    `New mechanic response - ${APP_NAME}`,
    mechanicResponseEmailTemplate(listingTitle)
  )
}

export async function sendQuoteStatusEmail(
  to: string,
  listingTitle: string,
  status: string
): Promise<SendEmailResult> {
  return sendEmail(
    to,
    `Quote ${status.toLowerCase()} - ${APP_NAME}`,
    quoteStatusEmailTemplate(listingTitle, status)
  )
}
