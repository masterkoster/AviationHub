import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Providers } from "@/app/components/providers";
import "./globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  metadataBase: new URL('https://koster.im'),
  title: {
    default: "AviationHub - Flight Planning, Fuel Prices & Aviation Tools",
    template: "%s | AviationHub"
  },
  description:
    "Comprehensive aviation tools including fuel price planning, flight cost calculator, aircraft search, and flight history. Find the cheapest fuel stops and plan your flight route efficiently.",
  keywords: [
    "aviation fuel prices",
    "flight planning",
    "fuel cost calculator",
    "general aviation",
    "pilot tools",
    "airport fuel prices",
    "100LL fuel prices",
    "flight cost estimation",
    "pilot resources",
    "aircraft search"
  ],
  authors: [{ name: "AviationHub" }],
  creator: "AviationHub",
  publisher: "AviationHub",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://koster.im",
    siteName: "AviationHub",
    title: "AviationHub - Flight Planning, Fuel Prices & Aviation Tools",
    description: "Comprehensive aviation tools including fuel price planning, flight cost calculator, aircraft search, and flight history.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AviationHub - Flight Planning & Fuel Prices",
    description: "Find the cheapest fuel stops and plan your flight route efficiently.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AviationHub",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}>
        <Providers>
          {children}
        </Providers>
        <SpeedInsights />
        {GA_ID && <GoogleAnalytics gaId={GA_ID} />}
      </body>
    </html>
  );
}
