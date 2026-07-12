'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plane, Clock, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react';
import { fmtNum } from '@/lib/utils';

interface CheckoutPanelProps {
  groupId: string;
  userId?: string;
}

interface ActiveFlight {
  id: string;
  aircraftId: string;
  aircraft: {
    nNumber: string;
    name: string;
    make: string;
    model: string;
  };
  user: {
    id: string;
    name: string;
  };
  hobbsStart: number | string;
  checkedOutAt: string;
}

interface Aircraft {
  id: string;
  nNumber: string;
  customName: string;
  nickname: string;
  make: string;
  model: string;
  hourlyRate: number;
}

export default function CheckoutPanel({ groupId, userId }: CheckoutPanelProps) {
  const [activeFlight, setActiveFlight] = useState<ActiveFlight | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [selectedAircraft, setSelectedAircraft] = useState('');
  const [hobbsStart, setHobbsStart] = useState('');
  const [checkoutNotes, setCheckoutNotes] = useState('');

  // Checkin form
  const [hobbsEnd, setHobbsEnd] = useState('');
  const [checkinNotes, setCheckinNotes] = useState('');

  useEffect(() => {
    fetchData();
  }, [groupId]);

  const fetchData = async () => {
    try {
      // Get aircraft
      const aircraftRes = await fetch(`/api/clubs/${groupId}/aircraft`);
      const aircraftData = await aircraftRes.json();
      setAircraft(aircraftData || []);

      // Get active flights
      const activeRes = await fetch(`/api/clubs/${groupId}/flights/active`);
      const activeData = await activeRes.json();
      
      if (activeData && activeData.length > 0) {
        setActiveFlight(activeData[0]);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckingOut(true);

    try {
      const res = await fetch(`/api/clubs/${groupId}/flights/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftId: selectedAircraft,
          hobbsStart: parseFloat(hobbsStart),
          notes: checkoutNotes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveFlight(data.flight);
        setSelectedAircraft('');
        setHobbsStart('');
        setCheckoutNotes('');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to checkout');
      }
    } catch (err) {
      console.error('Checkout failed:', err);
      alert('Failed to checkout');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckingIn(true);

    try {
      const res = await fetch(`/api/clubs/${groupId}/flights/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flightLogId: activeFlight?.id,
          hobbsEnd: parseFloat(hobbsEnd),
          notes: checkinNotes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Flight complete! Hobbs: ${fmtNum(data.flight.hobbsTime, 1)}, Cost: $${fmtNum(data.flight.calculatedCost, 2)}`);
        setActiveFlight(null);
        setHobbsEnd('');
        setCheckinNotes('');
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to checkin');
      }
    } catch (err) {
      console.error('Checkin failed:', err);
      alert('Failed to checkin');
    } finally {
      setCheckingIn(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  // Show checkin form if aircraft is checked out
  if (activeFlight) {
    const hobbsStartNum = Number(activeFlight.hobbsStart);
    const hoursOut = Number.isFinite(hobbsStartNum)
      ? (new Date().getTime() - new Date(activeFlight.checkedOutAt).getTime()) / (1000 * 60 * 60)
      : 0;

    return (
      <Card className="border-green-500">
        <CardHeader className="bg-green-50 dark:bg-green-950">
          <CardTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            Aircraft Checked Out
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Aircraft</Label>
              <p className="font-medium">{activeFlight.aircraft.nNumber}</p>
              <p className="text-sm text-muted-foreground">
                {activeFlight.aircraft.name || `${activeFlight.aircraft.make} ${activeFlight.aircraft.model}`}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Checked Out</Label>
              <p className="font-medium">
                {new Date(activeFlight.checkedOutAt).toLocaleTimeString()}
              </p>
              <p className="text-sm text-muted-foreground">
                {hoursOut.toFixed(1)} hours ago
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Hobbs Start</Label>
              <p className="font-medium">{fmtNum(activeFlight.hobbsStart, 1)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Current Hobbs</Label>
              <p className="font-medium text-lg">
                {fmtNum(hobbsStartNum + hoursOut, 1)}
              </p>
            </div>
          </div>

          <form onSubmit={handleCheckin} className="space-y-4 pt-4 border-t">
            <div>
              <Label htmlFor="hobbsEnd">Enter Ending Hobbs</Label>
              <Input
                id="hobbsEnd"
                type="number"
                step="0.1"
                value={hobbsEnd}
                onChange={(e) => setHobbsEnd(e.target.value)}
                placeholder="e.g., 102.5"
                required
              />
            </div>
            <div>
              <Label htmlFor="checkinNotes">Notes (optional)</Label>
              <Input
                id="checkinNotes"
                value={checkinNotes}
                onChange={(e) => setCheckinNotes(e.target.value)}
                placeholder="Any notes about the flight"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={checkingIn}
            >
              {checkingIn ? 'Processing...' : 'Check In & Complete Flight'}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // Show checkout form
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plane className="h-5 w-5" />
          Aircraft Checkout
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCheckout} className="space-y-4">
          <div>
            <Label htmlFor="aircraft">Select Aircraft</Label>
            <select
              id="aircraft"
              className="w-full border rounded-md px-3 py-2 bg-background"
              value={selectedAircraft}
              onChange={(e) => setSelectedAircraft(e.target.value)}
              required
            >
              <option value="">Choose an aircraft...</option>
              {aircraft.map(a => (
                <option key={a.id} value={a.id}>
                  {a.nNumber} - {a.customName || a.nickname || `${a.make} ${a.model}`} (${a.hourlyRate}/hr)
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="hobbsStart">Enter Starting Hobbs</Label>
            <Input
              id="hobbsStart"
              type="number"
              step="0.1"
              value={hobbsStart}
              onChange={(e) => setHobbsStart(e.target.value)}
              placeholder="e.g., 98.5"
              required
            />
          </div>

          <div>
            <Label htmlFor="checkoutNotes">Notes (optional)</Label>
            <Input
              id="checkoutNotes"
              value={checkoutNotes}
              onChange={(e) => setCheckoutNotes(e.target.value)}
              placeholder="Pre-flight notes"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full"
            disabled={checkingOut || !selectedAircraft || !hobbsStart}
          >
            {checkingOut ? 'Checking Out...' : 'Check Out Aircraft'}
          </Button>

          {aircraft.length === 0 && (
            <p className="text-sm text-amber-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              No aircraft available for this club.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
