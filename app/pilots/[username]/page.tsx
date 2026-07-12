'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type PilotProfile = {
  id: string;
  userId: string;
  homeAirport?: string | null;
  ratings: string[];
  availability?: string | null;
  aircraft?: string | null;
  hours?: number | null;
  bio?: string | null;
  user?: {
    id: string;
    name?: string | null;
    username?: string | null;
    email?: string | null;
    tier?: string | null;
    image?: string | null;
    age?: number | null;
  } | null;
};

type AirportDetails = {
  icao?: string;
  name?: string;
  city?: string;
  state?: string;
};

function initials(name?: string | null) {
  const raw = (name || '').trim();
  if (!raw) return '?';
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (first + last).toUpperCase();
}

export default function PilotPublicProfilePage() {
  const params = useParams<{ username: string }>();
  const handle = typeof params?.username === 'string' ? params.username : '';
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  const [airport, setAirport] = useState<AirportDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayName = useMemo(() => {
    const user = profile?.user;
    return user?.name || user?.username || 'Pilot';
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setAirport(null);
      try {
        const res = await fetch(`/api/pilots?q=${encodeURIComponent(handle)}`);
        const data = await res.json();
        const profiles: PilotProfile[] = data.profiles || [];

        const exact = profiles.find((p) => {
          const username = (p.user?.username || '').toLowerCase();
          return username && username === handle.toLowerCase();
        });
        const byId = profiles.find((p) => p.user?.id === handle || p.userId === handle);
        const picked = exact || byId || null;

        if (!picked) {
          if (!cancelled) setProfile(null);
          return;
        }

        if (!cancelled) setProfile(picked);

        const icao = (picked.homeAirport || '').toString().trim().toUpperCase();
        if (icao) {
          const airportRes = await fetch(`/api/airports/${encodeURIComponent(icao)}`);
          if (airportRes.ok) {
            const airportData = await airportRes.json();
            if (!cancelled) {
              setAirport({
                icao: airportData.icao || icao,
                name: airportData.name,
                city: airportData.city,
                state: airportData.state,
              });
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load profile');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Pilot Profile</h1>
            <p className="text-slate-400 text-sm">@{handle}</p>
          </div>
          <Link href="/modules/pilot-directory" className="text-sm text-emerald-400 hover:text-emerald-300">
            Back to directory
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center text-slate-400">
            Loading profile…
          </div>
        ) : error ? (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        ) : !profile ? (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center text-slate-400">
            Pilot not found.
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {profile.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.user.image}
                    alt=""
                    className="h-12 w-12 rounded-full border border-slate-700 object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-slate-700/70 border border-slate-600 flex items-center justify-center text-white font-semibold">
                    {initials(profile.user?.name || profile.user?.username)}
                  </div>
                )}
                <div>
                  <div className="text-white text-lg font-semibold">{displayName}</div>
                  <div className="text-xs text-slate-400">
                    {typeof profile.user?.age === 'number' ? `${profile.user.age} years old` : null}
                    {typeof profile.user?.age === 'number' && airport ? ' • ' : null}
                    {airport
                      ? `${airport.city || '—'}, ${airport.state || '—'} • ${airport.name || 'Airport'} (${airport.icao})`
                      : profile.homeAirport
                        ? `Home: ${profile.homeAirport}`
                        : 'No home airport'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {profile.ratings?.map((rating) => (
                  <span key={rating} className="text-xs bg-slate-700 text-slate-200 px-2 py-0.5 rounded-full">
                    {rating}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">Availability</div>
                <div className="text-sm text-slate-200 mt-1">{profile.availability || '—'}</div>
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">Hours</div>
                <div className="text-sm text-slate-200 mt-1">
                  {typeof profile.hours === 'number' ? profile.hours.toLocaleString() : '—'}
                </div>
              </div>
            </div>

            <div className="mt-4 bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500">Aircraft</div>
              <div className="text-sm text-slate-200 mt-1 whitespace-pre-wrap">{profile.aircraft || '—'}</div>
            </div>

            <div className="mt-4 bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500">Bio</div>
              <div className="text-sm text-slate-200 mt-1 whitespace-pre-wrap">{profile.bio || '—'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
