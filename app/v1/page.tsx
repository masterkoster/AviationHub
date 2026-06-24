import { redirect } from 'next/navigation'

export default function V1RootPage() {
  redirect('/v1/dashboard')
}
