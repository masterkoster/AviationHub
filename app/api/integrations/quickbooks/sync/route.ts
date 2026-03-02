import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { QuickBooksClient } from '@/lib/integrations/quickbooks-client'

/**
 * POST /api/integrations/quickbooks/sync
 * 
 * Manually trigger QuickBooks sync
 * Syncs invoices, payments, and customers
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { groupId, syncType } = await request.json()

    if (!groupId) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 })
    }

    // TODO: Verify user has admin access to this group

    // Find integration
    const integration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: groupId,
          provider: 'quickbooks',
        },
      },
    })

    if (!integration || integration.status !== 'connected') {
      return NextResponse.json({ error: 'QuickBooks not connected' }, { status: 400 })
    }

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        integrationId: integration.id,
        syncType: syncType || 'manual',
        direction: 'to_qb',
        status: 'pending',
        recordsTotal: 0,
        recordsSuccess: 0,
        recordsFailed: 0,
      },
    })

    const startTime = Date.now()
    let recordsTotal = 0
    let recordsSuccess = 0
    let recordsFailed = 0
    let errorMessage = null

    try {
      const client = new QuickBooksClient({}, integration.id)

      // Get company info to verify connection
      const companyInfo = await client.getCompanyInfo(integration.realmId!)
      console.log('QuickBooks company:', companyInfo.CompanyName)

      // ────────────────────────────────────────────────────────────────────
      // Sync Members → Customers
      // ────────────────────────────────────────────────────────────────────
      if (!syncType || syncType === 'customers' || syncType === 'all') {
        const members = await prisma.organizationMember.findMany({
          where: { organizationId: groupId },
          include: { user: true },
        })

        for (const member of members) {
          recordsTotal++
          
          try {
            // Check if customer already exists in QB
            const mapping = await prisma.quickBooksMapping.findUnique({
              where: {
                integrationId_entityType_entityId: {
                  integrationId: integration.id,
                  entityType: 'member',
                  entityId: member.id,
                },
              },
            })

            if (!mapping) {
              // Create new customer in QuickBooks
              const customer = await client.createCustomer({
                DisplayName: member.user.name || member.user.email,
                PrimaryEmailAddr: { Address: member.user.email },
              }, integration.realmId!)

              // Save mapping
              await prisma.quickBooksMapping.create({
                data: {
                  integrationId: integration.id,
                  entityType: 'member',
                  entityId: member.id,
                  entityName: member.user.name || member.user.email,
                  qbType: 'Customer',
                  qbId: customer.Id,
                  qbName: customer.DisplayName,
                },
              })

              recordsSuccess++
            } else {
              recordsSuccess++ // Already synced
            }
          } catch (error) {
            console.error(`Failed to sync member ${member.id}:`, error)
            recordsFailed++
          }
        }
      }

      // ────────────────────────────────────────────────────────────────────
      // Sync Aircraft Rates → Items
      // ────────────────────────────────────────────────────────────────────
      if (!syncType || syncType === 'items' || syncType === 'all') {
        const aircraft = await prisma.clubAircraft.findMany({
          where: { organizationId: groupId },
        })

        for (const ac of aircraft) {
          recordsTotal++
          
          try {
            // Check if item already exists in QB
            const mapping = await prisma.quickBooksMapping.findUnique({
              where: {
                integrationId_entityType_entityId: {
                  integrationId: integration.id,
                  entityType: 'aircraft',
                  entityId: ac.id,
                },
              },
            })

            if (!mapping) {
              // Create service item in QuickBooks
              const item = await client.createItem({
                Name: `${ac.nNumber || ac.nickname || ac.customName || 'Aircraft'} - Aircraft Rental`,
                Type: 'Service',
                IncomeAccountRef: {
                  value: '1', // Default income account - should be configurable
                },
              }, integration.realmId!)

              // Save mapping
              await prisma.quickBooksMapping.create({
                data: {
                  integrationId: integration.id,
                  entityType: 'aircraft',
                  entityId: ac.id,
                  entityName: ac.nNumber || ac.nickname || ac.customName || 'Aircraft',
                  qbType: 'Item',
                  qbId: item.Id,
                  qbName: item.Name,
                },
              })

              recordsSuccess++
            } else {
              recordsSuccess++ // Already synced
            }
          } catch (error) {
            console.error(`Failed to sync aircraft ${ac.id}:`, error)
            recordsFailed++
          }
        }
      }

      // Update sync log with success
      const durationMs = Date.now() - startTime
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: recordsFailed > 0 ? 'partial' : 'success',
          recordsTotal,
          recordsSuccess,
          recordsFailed,
          completedAt: new Date(),
          durationMs,
          details: JSON.stringify({
            syncType,
            companyName: companyInfo.CompanyName,
          }),
        },
      })

      // Update integration last sync
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: recordsFailed > 0 ? 'partial' : 'success',
        },
      })

      return NextResponse.json({
        success: true,
        syncLog: {
          id: syncLog.id,
          status: recordsFailed > 0 ? 'partial' : 'success',
          recordsTotal,
          recordsSuccess,
          recordsFailed,
          durationMs,
        },
      })

    } catch (error: any) {
      errorMessage = error.message

      // Update sync log with failure
      const durationMs = Date.now() - startTime
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'error',
          recordsTotal,
          recordsSuccess,
          recordsFailed,
          errorMessage,
          completedAt: new Date(),
          durationMs,
        },
      })

      // Update integration status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'error',
          lastSyncError: errorMessage,
        },
      })

      throw error
    }

  } catch (error: any) {
    console.error('QuickBooks sync error:', error)
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    )
  }
}
