import { redirect } from 'next/navigation'

export default function OldLoginRedirect() {
  redirect('/desktop/login')
}
