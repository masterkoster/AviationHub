'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface TierExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TierExplainerModal({ isOpen, onClose }: TierExplainerModalProps) {
  const { data: session } = useSession();
  const [hasSeenExplainer, setHasSeenExplainer] = useState(false);

  useEffect(() => {
    // Check if user has seen the explainer before
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('hasSeenTierExplainer');
      if (seen) {
        setHasSeenExplainer(true);
      }
    }
  }, []);

  const handleClose = () => {
    // Mark as seen
    if (typeof window !== 'undefined') {
      localStorage.setItem('hasSeenTierExplainer', 'true');
    }
    setHasSeenExplainer(true);
    onClose();
  };

  if (!isOpen || hasSeenExplainer) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-800 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl border border-slate-700">
        {/* Header with plane animation */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">✈️</div>
          <h2 className="text-2xl font-bold text-white">
            Welcome to AviationHub!
          </h2>
          <p className="text-slate-400 mt-2">
            Your free flight planning & fuel saver tool
          </p>
        </div>

        {/* Free vs Pro comparison */}
        <div className="space-y-4 mb-6">
          {/* Free Tier */}
          <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
            <div className="flex items-center justify-between mb-3">
              <span className="text-lg font-semibold text-white">Free</span>
              <span className="text-slate-400">$0 forever</span>
            </div>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Up to 6 waypoints per flight
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Up to 5 saved flight plans
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> 1 Flying Club
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> 3 Aircraft profiles
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Home state fuel prices
              </li>
            </ul>
          </div>

          {/* Pro Tier */}
          <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 rounded-xl p-4 border-2 border-emerald-500/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-lg font-semibold text-emerald-400">Pro</span>
              <div className="text-right">
                <span className="text-2xl font-bold text-white">$3.99</span>
                <span className="text-slate-400 text-sm">/mo</span>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> <strong className="text-white">Unlimited</strong> waypoints
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> <strong className="text-white">Unlimited</strong> flight plans
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> <strong className="text-white">Unlimited</strong> Flying Clubs
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> <strong className="text-white">Unlimited</strong> Aircraft
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> All 50 states fuel prices
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Document storage (POH, insurance)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Export to ForeFlight & Garmin
              </li>
            </ul>
          </div>
        </div>

        {/* Early bird pricing */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6 text-center">
          <p className="text-amber-400 font-semibold">
            🎉 Early Bird Pricing: $39.99/year (save 17%)
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Lock in this rate for life when you sign up now!
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleClose}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            Got it, thanks!
          </button>
        </div>

        {/* Privacy note */}
        <p className="text-xs text-slate-500 text-center mt-4">
          🔒 We never sell your data. No ads. Built by a pilot, for pilots.
        </p>
      </div>
    </div>
  );
}
