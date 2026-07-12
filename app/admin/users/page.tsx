import { redirect } from 'next/navigation'

export default function OldAdminUsersPage() {
  redirect('/desktop/admin?tab=users')
}
