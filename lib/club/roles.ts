/**
 * Club role helpers.
 *
 * TREASURER ("financial director") is a finance-scoped role: it may run
 * billing cycles, view all member invoices, manage the Stripe connection,
 * set the billing schedule / statement emails, and send club-wide email
 * notices — but it is NOT an operational admin. Member management, club
 * settings/deletion, booking policy, inspections, and posts stay ADMIN
 * (or their existing ADMIN/OFFICER) gates.
 */
export const FINANCE_ROLES = ['ADMIN', 'TREASURER'] as const;

export function isFinanceRole(role: string | null | undefined): boolean {
  return role != null && (FINANCE_ROLES as readonly string[]).includes(role);
}
