import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

type Totals = {
  totalTime: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
}

type CurrencyCounts = {
  current: number
  expiring: number
  expired: number
}

type Props = {
  totals: Totals
  currencyCounts: CurrencyCounts
  formatHours: (value: number) => string
}

export function LogbookSummaryCards({ totals, currencyCounts, formatHours }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Total Hours</p>
          <p className="text-2xl font-semibold">{formatHours(totals.totalTime)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Night</p>
          <p className="text-2xl font-semibold">{formatHours(totals.nightTime)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Instrument</p>
          <p className="text-2xl font-semibold">{formatHours(totals.instrumentTime)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Cross Country</p>
          <p className="text-2xl font-semibold">{formatHours(totals.crossCountryTime)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Currency</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Current {currencyCounts.current}</Badge>
            <Badge variant="outline">Expiring {currencyCounts.expiring}</Badge>
            <Badge variant="outline">Expired {currencyCounts.expired}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
