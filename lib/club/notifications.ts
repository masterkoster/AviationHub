/**
 * Club lifecycle notification emails — booking confirmations/cancellations/
 * reminders, grounding alerts, and the weekly inspection digest.
 *
 * Every export here is non-throwing and best-effort: a failed or skipped
 * send must never fail the caller's request/job. Each function catches its
 * own errors, warns once (not per-recipient) when SMTP isn't configured, and
 * always resolves to a {sent, failed} tally so callers can log/aggregate
 * without a try/catch of their own. Mirrors the pattern in lib/billing.ts.
 */
import { sendEmail, isEmailConfigured } from '@/lib/email';

export interface NotificationResult {
  sent: number;
  failed: number;
}

function formatWhen(start: Date, end: Date): string {
  const dateFmt = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const sameDay = start.toDateString() === end.toDateString();
  const endStr = sameDay
    ? end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : `${end.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return `${dateFmt}, ${startTime} – ${endStr}`;
}

function wrap(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${title}</h2>
      ${bodyHtml}
    </div>
  `;
}

let warnedUnconfigured = false;
function warnUnconfiguredOnce(): void {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  console.warn('[club/notifications] SMTP not configured — skipping club notification emails.');
}

/** Single-recipient send: never throws, always returns a {sent, failed} tally. */
async function sendOne(to: string, subject: string, html: string, label: string): Promise<NotificationResult> {
  if (!isEmailConfigured()) {
    warnUnconfiguredOnce();
    return { sent: 0, failed: 0 };
  }
  try {
    const result = await sendEmail(to, subject, html);
    return result.success ? { sent: 1, failed: 0 } : { sent: 0, failed: 1 };
  } catch (err) {
    console.error(`[club/notifications] Failed to send ${label} to ${to}:`, err);
    return { sent: 0, failed: 1 };
  }
}

/** Multi-recipient send (grounding alerts, digests): best-effort per recipient. */
async function sendMany(to: string[], subject: string, html: string, label: string): Promise<NotificationResult> {
  const recipients = [...new Set(to.filter((email) => !!email))];
  if (recipients.length === 0) return { sent: 0, failed: 0 };
  if (!isEmailConfigured()) {
    warnUnconfiguredOnce();
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const email of recipients) {
    try {
      const result = await sendEmail(email, subject, html);
      if (result.success) sent += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[club/notifications] Failed to send ${label} to ${email}:`, err);
    }
  }
  return { sent, failed };
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export interface BookingEmailArgs {
  to: string;
  memberName: string;
  clubName: string;
  aircraftLabel: string;
  start: Date;
  end: Date;
  purpose?: string | null;
}

export async function sendBookingConfirmation(args: BookingEmailArgs): Promise<NotificationResult> {
  const { to, memberName, clubName, aircraftLabel, start, end, purpose } = args;
  const html = wrap(
    'Booking confirmed',
    `
      <p>Hi ${memberName},</p>
      <p>Your booking for <strong>${aircraftLabel}</strong> with ${clubName} is confirmed.</p>
      <ul>
        <li>When: ${formatWhen(start, end)}</li>
        ${purpose ? `<li>Purpose: ${purpose}</li>` : ''}
      </ul>
      <p>You can view or cancel this booking from the app.</p>
    `,
  );
  return sendOne(to, `[${clubName}] Booking confirmed — ${aircraftLabel}`, html, 'booking confirmation');
}

export interface BookingCancellationEmailArgs extends BookingEmailArgs {
  cancelledBy: string;
  reason?: string | null;
}

export async function sendBookingCancellation(args: BookingCancellationEmailArgs): Promise<NotificationResult> {
  const { to, memberName, clubName, aircraftLabel, start, end, purpose, cancelledBy, reason } = args;
  const html = wrap(
    'Booking cancelled',
    `
      <p>Hi ${memberName},</p>
      <p>Your booking for <strong>${aircraftLabel}</strong> with ${clubName} has been cancelled by ${cancelledBy}.</p>
      <ul>
        <li>Was scheduled: ${formatWhen(start, end)}</li>
        ${purpose ? `<li>Purpose: ${purpose}</li>` : ''}
      </ul>
      ${reason ? `<p>Note from ${cancelledBy}: "${reason}"</p>` : ''}
      <p>If this wasn't expected, contact your club admin.</p>
    `,
  );
  return sendOne(to, `[${clubName}] Booking cancelled — ${aircraftLabel}`, html, 'booking cancellation');
}

export async function sendBookingReminder(args: BookingEmailArgs): Promise<NotificationResult> {
  const { to, memberName, clubName, aircraftLabel, start, end, purpose } = args;
  const html = wrap(
    'Upcoming booking reminder',
    `
      <p>Hi ${memberName},</p>
      <p>This is a reminder that you have <strong>${aircraftLabel}</strong> booked with ${clubName} in about 24 hours.</p>
      <ul>
        <li>When: ${formatWhen(start, end)}</li>
        ${purpose ? `<li>Purpose: ${purpose}</li>` : ''}
      </ul>
      <p>Need to cancel or change plans? Do it from the app so the aircraft frees up for others.</p>
    `,
  );
  return sendOne(to, `[${clubName}] Reminder: booking tomorrow — ${aircraftLabel}`, html, 'booking reminder');
}

// ── Maintenance / grounding ─────────────────────────────────────────────────

export interface GroundingAlertArgs {
  to: string[];
  clubName: string;
  aircraftLabel: string;
  description: string;
  reporterName: string;
}

export async function sendGroundingAlert(args: GroundingAlertArgs): Promise<NotificationResult> {
  const { to, clubName, aircraftLabel, description, reporterName } = args;
  const html = wrap(
    'Aircraft grounded',
    `
      <p><strong>${aircraftLabel}</strong> has been grounded for ${clubName}.</p>
      <ul>
        <li>Reported by: ${reporterName}</li>
        <li>Description: ${description}</li>
      </ul>
      <p>The aircraft cannot be booked until this is resolved. Review it in the maintenance queue.</p>
    `,
  );
  return sendMany(to, `[${clubName}] ${aircraftLabel} grounded`, html, 'grounding alert');
}

// ── Inspections ──────────────────────────────────────────────────────────────

export interface InspectionDigestItem {
  aircraft: string;
  label: string;
  status: string;
  countdown: string;
}

export interface InspectionDigestArgs {
  to: string[];
  clubName: string;
  items: InspectionDigestItem[];
}

export async function sendInspectionDigest(args: InspectionDigestArgs): Promise<NotificationResult> {
  const { to, clubName, items } = args;
  if (items.length === 0) return { sent: 0, failed: 0 };

  const rows = items
    .map(
      (item) =>
        `<li><strong>${item.aircraft}</strong> — ${item.label}: ${item.status} (${item.countdown})</li>`,
    )
    .join('');

  const html = wrap(
    'Weekly inspection digest',
    `
      <p>The following inspections for ${clubName} are due soon or overdue:</p>
      <ul>${rows}</ul>
      <p>Review inspections in the app to schedule maintenance.</p>
    `,
  );
  return sendMany(to, `[${clubName}] Inspection digest — ${items.length} item(s) need attention`, html, 'inspection digest');
}
