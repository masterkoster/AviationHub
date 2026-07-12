// Shared types for the flying-club home page view.

export interface Post {
  id: string
  title: string
  content: string
  pinned: boolean
  author: { id: string; name: string | null; image: string | null }
  createdAt: string
  updatedAt: string
}

export interface DocumentMeta {
  id: string
  name: string
  description: string | null
  category: string
  mimeType: string
  fileSize: number
  createdAt: string
  uploadedBy: { id: string; name: string | null }
}

export interface BlockOutItem {
  id: string
  title: string
  startTime: string
  endTime: string
  clubAircraftId: string | null
  aircraft: { id: string; nNumber: string | null; customName: string | null; nickname: string | null } | null
}

export interface MaintenanceItemLite {
  id: string
  description: string
  status: string
  isGrounded: boolean
  reportedDate: string
  resolvedDate: string | null
  aircraft: { id: string; nNumber: string | null; customName: string | null; nickname: string | null } | null
}
