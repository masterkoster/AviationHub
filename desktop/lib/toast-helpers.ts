'use client'

import { toast } from '@/components/ui/use-toast'

export function notifySaved(entity: string) {
  toast({ title: 'Saved', description: `${entity} saved successfully.` })
}

export function notifyDeleted(entity: string) {
  toast({ title: 'Deleted', description: `${entity} deleted.`, variant: 'destructive' })
}

export function notifyCreated(entity: string) {
  toast({ title: 'Created', description: `${entity} created.` })
}

export function notifyError(entity: string, message: string) {
  toast({ title: `${entity} Error`, description: message, variant: 'destructive' })
}

export function notifyExported(entity: string) {
  toast({ title: 'Exported', description: `${entity} exported.` })
}

export function notifyImported(entity: string) {
  toast({ title: 'Imported', description: `${entity} imported.` })
}

export function notifySignedOut() {
  toast({ title: 'Signed out', description: 'You have been signed out.' })
}

export function notifySignedIn() {
  toast({ title: 'Welcome back', description: 'Signed in successfully.' })
}
