// Tunable point values + reputation tiers for the contribution ledger. Pure
// config — no I/O. Points are used to weight community fuel-price voting so
// trusted contributors' votes count more (harder to manipulate). These are
// NOT rewards/tiers-as-perks — just internal weighting.

export const CONTRIBUTION_POINTS = {
  FUEL_LOG: 5,
  PRICE_REPORT: 3,
} as const;

export type ReputationTier = {
  key: string;
  label: string;
  weight: number;
};

export function reputationTier(points: number): ReputationTier {
  if (points >= 300) return { key: 'pillar', label: 'Pillar', weight: 2.5 };
  if (points >= 100) return { key: 'veteran', label: 'Veteran', weight: 2.0 };
  if (points >= 40) return { key: 'trusted', label: 'Trusted', weight: 1.5 };
  if (points >= 10) return { key: 'contributor', label: 'Contributor', weight: 1.25 };
  return { key: 'new', label: 'New', weight: 1.0 };
}

export function reputationWeight(points: number): number {
  return reputationTier(points).weight;
}
