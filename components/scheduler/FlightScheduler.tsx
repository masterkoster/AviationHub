"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Group = {
  id: string;
  name: string;
  aircraft: GroupAircraft[];
};

type GroupAircraft = {
  id: string;
  nNumber: string;
  nickname?: string | null;
  make?: string | null;
  model?: string | null;
};

type Booking = {
  id: string;
  aircraftId?: string;
  userAircraftId?: string;
  startTime: string;
  endTime: string;
};

type UserAircraft = {
  id: string;
  nNumber: string;
  nickname?: string | null;
};

type FlightSchedulerProps = {
  onSuccess?: () => void;
  initialMode?: "personal" | "club";
  initialGroupId?: string;
  initialAircraftId?: string;
  lockMode?: boolean;
  lockGroup?: boolean;
  hideModeToggle?: boolean;
};

export function FlightScheduler({
  onSuccess,
  initialMode = "personal",
  initialGroupId = "",
  initialAircraftId = "",
  lockMode = false,
  lockGroup = false,
  hideModeToggle = false,
}: FlightSchedulerProps) {
  const { data: session } = useSession();
  const [mode, setMode] = useState<"personal" | "club">(initialMode);
  const [groups, setGroups] = useState<Group[]>([]);
  const [personalAircraft, setPersonalAircraft] = useState<UserAircraft[]>([]);
  const [clubBookings, setClubBookings] = useState<Booking[]>([]);
  const [personalBookings, setPersonalBookings] = useState<Booking[]>([]);
  const [groupId, setGroupId] = useState<string>(initialGroupId);
  const [aircraftId, setAircraftId] = useState<string>(initialAircraftId);
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (lockMode) setMode(initialMode);
  }, [lockMode, initialMode]);

  useEffect(() => {
    if (initialGroupId) setGroupId(initialGroupId);
  }, [initialGroupId]);

  useEffect(() => {
    if (initialAircraftId) setAircraftId(initialAircraftId);
  }, [initialAircraftId]);

  useEffect(() => {
    const sessionKey = session?.user?.id ?? session?.user?.email;
    if (!sessionKey) return;
    let cancelled = false;

    async function loadBaseData() {
      try {
        const [groupsRes, personalRes] = await Promise.all([
          fetch("/api/groups"),
          fetch("/api/user-aircraft"),
        ]);

        if (groupsRes.ok) {
          const groupData = await groupsRes.json();
          if (!cancelled) setGroups(groupData || []);
        }

        if (personalRes.ok) {
          const personalData = await personalRes.json();
          if (!cancelled) setPersonalAircraft(personalData.aircraft || []);
        }
      } catch (err) {
        console.error("Failed to load scheduler data", err);
      }
    }

    loadBaseData();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, session?.user?.email]);

  useEffect(() => {
    if (mode !== "club" || !groupId) return;
    let cancelled = false;

    async function loadClubBookings() {
      try {
        const res = await fetch(`/api/groups/${groupId}/bookings`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setClubBookings(Array.isArray(data) ? data : data.bookings || []);
      } catch (err) {
        console.error("Failed to load club bookings", err);
      }
    }

    loadClubBookings();
    return () => {
      cancelled = true;
    };
  }, [mode, groupId]);

  useEffect(() => {
    if (mode !== "personal") return;
    let cancelled = false;

    async function loadPersonalBookings() {
      try {
        const res = await fetch("/api/personal-bookings?days=all");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPersonalBookings(Array.isArray(data) ? data : data.bookings || []);
      } catch (err) {
        console.error("Failed to load personal bookings", err);
      }
    }

    loadPersonalBookings();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const selectedGroup = groups.find((g) => g.id === groupId);
  const clubAircraft = selectedGroup?.aircraft || [];

  const isTimeOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
    const startA = new Date(aStart).getTime();
    const endA = new Date(aEnd).getTime();
    const startB = new Date(bStart).getTime();
    const endB = new Date(bEnd).getTime();
    return startA < endB && endA > startB;
  };

  const availableClubAircraft = useMemo(() => {
    if (!startTime || !endTime) return clubAircraft;
    return clubAircraft.filter((ac) =>
      !clubBookings.some((b) =>
        b.aircraftId === ac.id && isTimeOverlap(startTime, endTime, b.startTime, b.endTime)
      )
    );
  }, [clubAircraft, clubBookings, startTime, endTime]);

  const availablePersonalAircraft = useMemo(() => {
    if (!startTime || !endTime) return personalAircraft;
    return personalAircraft.filter((ac) =>
      !personalBookings.some((b) =>
        b.userAircraftId === ac.id && isTimeOverlap(startTime, endTime, b.startTime, b.endTime)
      )
    );
  }, [personalAircraft, personalBookings, startTime, endTime]);

  const handleSubmit = async () => {
    if (!session?.user?.id) {
      setError("Please sign in to schedule a flight");
      return;
    }
    if (!startTime || !endTime || !aircraftId) {
      setError("Aircraft, start time, and end time are required");
      return;
    }
    if (mode === "club" && !groupId) {
      setError("Select a flying club");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const endpoint = mode === "personal" ? "/api/personal-bookings" : `/api/groups/${groupId}/bookings`;
      const payload = mode === "personal"
        ? { userAircraftId: aircraftId, startTime, endTime, purpose: purpose || null }
        : { aircraftId, startTime, endTime, purpose: purpose || null };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to schedule flight");
      }

      setPurpose("");
      setAircraftId("");
      setStartTime("");
      setEndTime("");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to schedule flight");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!hideModeToggle && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={mode === "personal" ? "default" : "outline"}
            onClick={() => setMode("personal")}
          >
            Personal
          </Button>
          <Button
            size="sm"
            variant={mode === "club" ? "default" : "outline"}
            onClick={() => setMode("club")}
          >
            Flying Club
          </Button>
          <Badge variant="outline" className="ml-auto text-xs">
            {mode === "personal" ? "Personal" : "Club"}
          </Badge>
        </div>
      )}

      {mode === "club" && !lockGroup && (
        <div className="space-y-2">
          <Label>Flying Club</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setAircraftId("");
            }}
          >
            <option value="">Select a club...</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Start Time</Label>
          <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>End Time</Label>
          <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Aircraft</Label>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={aircraftId}
          onChange={(e) => setAircraftId(e.target.value)}
        >
          <option value="">Select aircraft...</option>
          {(mode === "personal" ? availablePersonalAircraft : availableClubAircraft).map((ac) => (
            <option key={ac.id} value={ac.id}>
              {ac.nNumber}{ac.nickname ? ` (${ac.nickname})` : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {mode === "personal"
            ? `${availablePersonalAircraft.length} available`
            : `${availableClubAircraft.length} available`}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Purpose</Label>
        <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Optional" />
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Scheduling..." : "Schedule Flight"}
      </Button>
    </div>
  );
}
