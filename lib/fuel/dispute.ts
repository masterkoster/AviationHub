// Shared dispute rule for community fuel price submissions. Defined once so
// the feed and trend endpoints (and the desktop UI) agree on the threshold.

export function isDisputed(upvotes: number, downvotes: number): boolean {
  return downvotes >= 3 && downvotes > upvotes;
}

export function voteScore(up: number, down: number): number {
  return up - down;
}
