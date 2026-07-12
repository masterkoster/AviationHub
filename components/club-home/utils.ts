export function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return iso }
}

export function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

export function aircraftLabel(a: { nNumber?: string | null; nickname?: string | null; customName?: string | null } | null | undefined) {
  if (!a) return 'Aircraft'
  return a.nNumber || a.customName || a.nickname || 'Aircraft'
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
