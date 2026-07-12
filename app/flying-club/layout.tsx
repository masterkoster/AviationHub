import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Flying Club - Manage Your Aviation Group',
  description: 'Create and manage your flying club or aviation group. Coordinate flights, share costs, and connect with fellow pilots in your group.',
  keywords: ['flying club', 'aviation group', 'pilot group', 'flight sharing', 'pilot community', 'fly together', 'aviation club management'],
  openGraph: {
    title: 'Flying Club - Manage Your Aviation Group',
    description: 'Create and manage your flying club or aviation group.',
  },
};

export default function FlyingClubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
