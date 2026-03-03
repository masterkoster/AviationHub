'use client'

import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldCheck, AlertCircle, CheckCircle2, Clock, Plane, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function CurrencyPage() {
  const { data, isLoading } = useSWR('/api/logbook/currency/progress', fetcher, {
    refreshInterval: 60000
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'current': return 'bg-green-500'
      case 'expiring': return 'bg-yellow-500'
      case 'expired': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'current': return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'expiring': return <Clock className="w-5 h-5 text-yellow-500" />
      case 'expired': return <AlertCircle className="w-5 h-5 text-red-500" />
      default: return <Clock className="w-5 h-5 text-gray-500" />
    }
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getDaysUntil = (dateStr: string | null | undefined) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Currency</h1>
            <p className="text-sm text-muted-foreground">FAA/EASA currency status and requirements</p>
          </div>
        </div>
      </div>
      
      <div className="px-6 py-6 space-y-6">
        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading currency data...
            </CardContent>
          </Card>
        ) : !data?.progress ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No currency data available
            </CardContent>
          </Card>
        ) : (
          <>
            {/* FAA Currency */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plane className="w-5 h-5" />
                  FAA Currency
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.progress.filter((r: any) => r.authority === 'FAA').map((rule: any) => {
                  const daysUntil = getDaysUntil(rule.nextDueAt)
                  return (
                    <div key={rule.code} className="flex items-start justify-between p-4 bg-secondary/30 rounded-lg">
                      <div className="flex items-start gap-3">
                        {getStatusIcon(rule.status)}
                        <div>
                          <p className="font-semibold">{rule.name}</p>
                          <div className="mt-2 space-y-1">
                            {rule.progress.map((p: any, i: number) => (
                              <div key={i} className="text-sm text-muted-foreground">
                                {p.completed} / {p.required} {p.unit}
                                {p.required > 1 && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({Math.round((p.completed / p.required) * 100)}%)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge 
                          variant={rule.status === 'current' ? 'default' : rule.status === 'expiring' ? 'outline' : 'destructive'}
                          className={rule.status === 'current' ? 'bg-green-500' : ''}
                        >
                          {rule.status.toUpperCase()}
                        </Badge>
                        {rule.nextDueAt && daysUntil !== null && (
                          <p className={`text-xs mt-2 ${daysUntil < 0 ? 'text-red-500' : daysUntil < 30 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                            {daysUntil < 0 ? `Expired ${Math.abs(daysUntil)} days ago` : `${daysUntil} days remaining`}
                          </p>
                        )}
                        {rule.nextDueAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Due: {formatDate(rule.nextDueAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* EASA Currency */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  EASA Currency
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.progress.filter((r: any) => r.authority === 'EASA').map((rule: any) => {
                  const daysUntil = getDaysUntil(rule.nextDueAt)
                  return (
                    <div key={rule.code} className="flex items-start justify-between p-4 bg-secondary/30 rounded-lg">
                      <div className="flex items-start gap-3">
                        {getStatusIcon(rule.status)}
                        <div>
                          <p className="font-semibold">{rule.name}</p>
                          <div className="mt-2 space-y-1">
                            {rule.progress.map((p: any, i: number) => (
                              <div key={i} className="text-sm text-muted-foreground">
                                {p.completed} / {p.required} {p.unit}
                                {p.required > 1 && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({Math.round((p.completed / p.required) * 100)}%)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge 
                          variant={rule.status === 'current' ? 'default' : rule.status === 'expiring' ? 'outline' : 'destructive'}
                          className={rule.status === 'current' ? 'bg-green-500' : ''}
                        >
                          {rule.status.toUpperCase()}
                        </Badge>
                        {rule.nextDueAt && daysUntil !== null && (
                          <p className={`text-xs mt-2 ${daysUntil < 0 ? 'text-red-500' : daysUntil < 30 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                            {daysUntil < 0 ? `Expired ${Math.abs(daysUntil)} days ago` : `${daysUntil} days remaining`}
                          </p>
                        )}
                        {rule.nextDueAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Due: {formatDate(rule.nextDueAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
