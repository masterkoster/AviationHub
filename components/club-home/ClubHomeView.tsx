'use client'

import { ClubStatusBanner } from './ClubStatusBanner'
import { AtAGlanceStrip } from './AtAGlanceStrip'
import { AnnouncementsFeed } from './AnnouncementsFeed'
import { UpcomingDowntime } from './UpcomingDowntime'
import { DocumentsPanel } from './DocumentsPanel'
import type { Post, DocumentMeta, BlockOutItem, MaintenanceItemLite } from './types'

interface BookingLite {
  startTime: string
  endTime: string
  purpose: string | null
  aircraft: { nNumber: string | null; nickname?: string | null; customName?: string | null } | null
  user: { id: string } | null
}

interface ClubHomeViewProps {
  groupId: string
  canManage: boolean
  currentUserId: string | null

  maintenance: MaintenanceItemLite[]
  fleetSize: number
  availableCount: number
  nextBooking: BookingLite | null

  posts: Post[]
  postsLoading: boolean
  postsError: string | null
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>

  documents: DocumentMeta[]
  documentsLoading: boolean
  documentsError: string | null
  setDocuments: React.Dispatch<React.SetStateAction<DocumentMeta[]>>

  blockOuts: BlockOutItem[]
  blockOutsLoading: boolean
  blockOutsError: string | null
}

export function ClubHomeView({
  groupId,
  canManage,
  currentUserId,
  maintenance,
  fleetSize,
  availableCount,
  nextBooking,
  posts,
  postsLoading,
  postsError,
  setPosts,
  documents,
  documentsLoading,
  documentsError,
  setDocuments,
  blockOuts,
  blockOutsLoading,
  blockOutsError,
}: ClubHomeViewProps) {
  const openSquawks = maintenance.filter(m => !m.resolvedDate)
  const groundedCount = openSquawks.filter(m => m.isGrounded).length

  return (
    <div className="space-y-6">
      <ClubStatusBanner blockOuts={blockOuts} maintenance={maintenance} />

      <AtAGlanceStrip
        nextBooking={nextBooking}
        openSquawkCount={openSquawks.length}
        groundedCount={groundedCount}
        fleetSize={fleetSize}
        availableCount={availableCount}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <AnnouncementsFeed
            groupId={groupId}
            posts={posts}
            loading={postsLoading}
            error={postsError}
            canManage={canManage}
            currentUserId={currentUserId}
            setPosts={setPosts}
          />
        </div>
        <div className="space-y-6">
          <UpcomingDowntime
            blockOuts={blockOuts}
            loading={blockOutsLoading}
            error={blockOutsError}
            canManage={canManage}
          />
          <DocumentsPanel
            groupId={groupId}
            documents={documents}
            loading={documentsLoading}
            error={documentsError}
            canManage={canManage}
            currentUserId={currentUserId}
            setDocuments={setDocuments}
          />
        </div>
      </div>
    </div>
  )
}
