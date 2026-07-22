// Settings now owns its own tabs (see app/desktop/settings/page.tsx) - in-page
// client-side tab switching instead of 9 separate routes, so this layout no
// longer renders a route-based sub-nav. Kept as a pass-through so old deep
// links (redirected to /desktop/settings?tab=<name>) still render inside the
// /desktop/settings subtree.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
