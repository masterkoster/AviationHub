import { Button } from '@/components/ui/button'

type Props = {
  onAdd: () => void
  onImport: () => void
  onPrint: () => void
  onRefreshCurrency: () => void
}

export function LogbookHeader({ onAdd, onImport, onPrint, onRefreshCurrency }: Props) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Logbook</h1>
        <p className="text-xs text-muted-foreground">FAA + EASA logbook with endorsements, currency, and reports.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onAdd}>Add Flight</Button>
        <Button size="sm" variant="outline" onClick={onImport}>Import</Button>
        <Button size="sm" variant="outline" onClick={onPrint}>Print</Button>
        <Button size="sm" variant="outline" onClick={onRefreshCurrency}>Refresh Currency</Button>
      </div>
    </div>
  )
}
