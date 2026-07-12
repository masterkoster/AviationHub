import { redirect } from 'next/navigation'

export default function OldAdminErrorsPage() {
  redirect('/desktop/admin?tab=errors')
}
