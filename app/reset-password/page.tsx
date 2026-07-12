import { redirect } from 'next/navigation'

export default function OldResetPasswordRedirect() {
  redirect('/desktop/reset-password')
}
