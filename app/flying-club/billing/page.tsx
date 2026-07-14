'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  DollarSign,
  Receipt,
  Play,
  RefreshCw,
  Calendar,
  Plane,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Clock,
  CreditCard,
} from 'lucide-react'

interface BillingRun {
  id: string
  startedAt: string
  completedAt: string | null
  status: 'running' | 'completed' | 'failed'
  totalAmount: number | null
  successCount: number | null
  failureCount: number | null
}

interface Invoice {
  id: string
  userId: string
  userName: string
  userEmail: string
  totalAmount: number
  status: 'pending' | 'paid' | 'failed'
  createdAt: string
}

interface AircraftStats {
  id: string
  name: string
  totalHobbs: number
  totalRevenue: number
  flightCount: number
}

// Demo data
const demoBillingRuns: BillingRun[] = [
  { id: '1', startedAt: '2024-02-01T00:00:00Z', completedAt: '2024-02-01T00:05:00Z', status: 'completed', totalAmount: 4250.00, successCount: 12, failureCount: 0 },
  { id: '2', startedAt: '2024-01-01T00:00:00Z', completedAt: '2024-01-01T00:03:00Z', status: 'completed', totalAmount: 3890.50, successCount: 11, failureCount: 1 },
  { id: '3', startedAt: '2023-12-01T00:00:00Z', completedAt: '2023-12-01T00:04:00Z', status: 'completed', totalAmount: 5120.00, successCount: 15, failureCount: 0 },
]

const demoInvoices: Invoice[] = [
  { id: 'inv-001', userId: 'user-1', userName: 'John Smith', userEmail: 'john@example.com', totalAmount: 485.50, status: 'pending', createdAt: '2024-02-01T00:00:00Z' },
  { id: 'inv-002', userId: 'user-2', userName: 'Sarah Johnson', userEmail: 'sarah@example.com', totalAmount: 320.00, status: 'paid', createdAt: '2024-02-01T00:00:00Z' },
  { id: 'inv-003', userId: 'user-3', userName: 'Mike Davis', userEmail: 'mike@example.com', totalAmount: 675.25, status: 'pending', createdAt: '2024-02-01T00:00:00Z' },
  { id: 'inv-004', userId: 'user-4', userName: 'Emily Chen', userEmail: 'emily@example.com', totalAmount: 210.00, status: 'paid', createdAt: '2024-01-01T00:00:00Z' },
]

const demoAircraftStats: AircraftStats[] = [
  { id: '1', name: 'N123AB (C172)', totalHobbs: 145.5, totalRevenue: 7275.00, flightCount: 28 },
  { id: '2', name: 'N456CD (C182)', totalHobbs: 98.2, totalRevenue: 9810.00, flightCount: 15 },
  { id: '3', name: 'N789EF (PA28)', totalHobbs: 210.8, totalRevenue: 8420.00, flightCount: 35 },
]

export default function BillingDashboardPage() {
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [billingRuns, setBillingRuns] = useState<BillingRun[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [aircraftStats, setAircraftStats] = useState<AircraftStats[]>([])
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  useEffect(() => {
    setBillingRuns(demoBillingRuns)
    setInvoices(demoInvoices)
    setAircraftStats(demoAircraftStats)
    setLoading(false)
  }, [session])

  const handleRunBilling = async () => {
    setRunning(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    const newRun: BillingRun = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      totalAmount: 4560.75,
      successCount: 13,
      failureCount: 0,
    }
    setBillingRuns([newRun, ...billingRuns])
    setRunning(false)
  }

  const handlePay = async (invoiceId: string) => {
    setPayingInvoiceId(invoiceId)
    setPayError(null)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pay`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setPayError(data.error || 'Failed to start payment'); return }
      if (data.url) window.location.href = data.url
    } catch {
      setPayError('Network error')
    } finally {
      setPayingInvoiceId(null)
    }
  }

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'running': return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-600 border-green-500/30'
      case 'running': return 'bg-blue-500/10 text-blue-600 border-blue-500/30'
      case 'failed': return 'bg-red-500/10 text-red-600 border-red-500/30'
      default: return ''
    }
  }

  const stats = {
    totalRevenue: billingRuns.reduce((sum, run) => sum + (run.totalAmount || 0), 0),
    pendingAmount: invoices.filter(i => i.status === 'pending').reduce((sum, i) => sum + i.totalAmount, 0),
    collectedAmount: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.totalAmount, 0),
  }

  if (status === 'loading' || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">Hobbs Billing Dashboard</h2>
            <p className="text-muted-foreground mb-4">Sign in to manage club billing</p>
            <Button asChild><a href="/login">Sign In</a></Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pt-16">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <DollarSign className="h-8 w-8" />
              Hobbs Billing
            </h1>
            <p className="text-muted-foreground">Automated hourly billing based on aircraft hobbs time</p>
          </div>
          <Button onClick={handleRunBilling} disabled={running} className="gap-2">
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Running Billing...' : 'Run Monthly Billing'}
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue (YTD)</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-amber-600">{formatCurrency(stats.pendingAmount)}</p>
                </div>
                <Clock className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Collected</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.collectedAmount)}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Invoices</p>
                  <p className="text-2xl font-bold">{invoices.length}</p>
                </div>
                <Receipt className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Aircraft Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plane className="h-5 w-5" />Aircraft Revenue</CardTitle>
            <CardDescription>Hobbs hours and revenue by aircraft</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {aircraftStats.map((aircraft) => (
                <div key={aircraft.id} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{aircraft.name}</h3>
                    <Badge variant="outline">{aircraft.flightCount} flights</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Hobbs</p>
                      <p className="font-medium">{aircraft.totalHobbs.toFixed(1)} hrs</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Revenue</p>
                      <p className="font-medium text-green-600">{formatCurrency(aircraft.totalRevenue)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="runs">
          <TabsList>
            <TabsTrigger value="runs">Billing Runs</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
          </TabsList>

          <TabsContent value="runs">
            <Card>
              <CardHeader>
                <CardTitle>Billing History</CardTitle>
                <CardDescription>Previous billing cycles and results</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">Date</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-right p-3 font-medium">Amount</th>
                      <th className="text-center p-3 font-medium">Success</th>
                      <th className="text-center p-3 font-medium">Failed</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingRuns.map((run) => (
                      <tr key={run.id} className="border-b hover:bg-muted/50">
                        <td className="p-3"><span>{formatDate(run.startedAt)}</span></td>
                        <td className="p-3"><Badge className={getStatusColor(run.status)}>{getStatusIcon(run.status)}<span className="ml-1 capitalize">{run.status}</span></Badge></td>
                        <td className="p-3 text-right font-medium">{run.totalAmount ? formatCurrency(run.totalAmount) : '-'}</td>
                        <td className="p-3 text-center text-green-600">{run.successCount ?? '-'}</td>
                        <td className="p-3 text-center">{run.failureCount ?? '-'}</td>
                        <td className="p-3 text-right"><Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" />View</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Invoice Management</CardTitle>
                <CardDescription>View and manage member invoices</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">Member</th>
                      <th className="text-left p-3 font-medium">Date</th>
                      <th className="text-right p-3 font-medium">Amount</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{invoice.userName}</p>
                            <p className="text-sm text-muted-foreground">{invoice.userEmail}</p>
                          </div>
                        </td>
                        <td className="p-3">{formatDate(invoice.createdAt)}</td>
                        <td className="p-3 text-right font-medium">{formatCurrency(invoice.totalAmount)}</td>
                        <td className="p-3 text-center">
                          <Badge className={invoice.status === 'paid' ? 'bg-green-500/10 text-green-600' : invoice.status === 'pending' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'}>
                            {invoice.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {invoice.status === 'pending' && (
                              <Button
                                size="sm"
                                onClick={() => handlePay(invoice.id)}
                                disabled={payingInvoiceId === invoice.id}
                              >
                                {payingInvoiceId === invoice.id ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
                                Pay
                              </Button>
                            )}
                            <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" />View</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {payError && <p className="text-sm text-destructive mt-2">{payError}</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
