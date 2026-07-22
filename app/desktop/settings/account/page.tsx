import { redirect } from 'next/navigation'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// Old route-based deep link (e.g. a bookmark to /desktop/settings/account, or
// the QuickBooks OAuth callback redirecting to /desktop/settings/accounting)
// - forward to the tabbed page with this section active. Any other query
// params (success/error from OAuth callbacks, etc.) are preserved.
export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'tab') continue
    if (typeof value === 'string') qs.set(key, value)
    else if (Array.isArray(value) && value.length > 0) qs.set(key, value[0])
  }
  qs.set('tab', 'account')
  redirect(`/desktop/settings?${qs.toString()}`)
}
