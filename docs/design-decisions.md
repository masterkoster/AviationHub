# Design Decisions

## Desktop-Only Policy (July 2026)

All app pages MUST live under `app/desktop/` and preserve the desktop card layout (shadcn/ui — `bg-card`, `border-border`, `bg-background` gradient background).

**Rules:**
- Every link from a desktop page must point to another `/desktop/*` path — never to the old web root (`/login`, `/forgot-password`, etc.)
- Email links (password reset, verification) must point to `/desktop/*` paths
- No redirects to the old website

**Exceptions:**
- API routes stay at `/api/*` (shared between web and desktop)

**Consistency:**
- Same card component style used across `app/desktop/login`, `app/desktop/forgot-password`, `app/desktop/reset-password`, `app/desktop/signup`
- No standalone full-page gradients or separate visual styles inside the desktop section

## Email Delivery (July 2026)

- **Provider:** Nodemailer via Gmail SMTP (free)
- **Config vars:** SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
- **Template system:** HTML templates in `lib/email-templates.ts`
- **Sender name:** "AviationHub" — user's Gmail address never exposed
