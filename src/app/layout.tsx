import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

const NAME = "Qwency";
const DESCRIPTION = "Tap in your day: sleep, work, gym, skin, spending and mood. See the patterns behind your days.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  applicationName: NAME,
  // opens like an app when added to an iPhone home screen (Android uses the manifest)
  appleWebApp: { capable: true, title: NAME, statusBarStyle: "default" },
  title: { default: `${NAME} | Daily behavior tracker`, template: `%s | ${NAME}` },
  description: DESCRIPTION,
  keywords: ["daily tracker", "habit tracker", "behavior analytics", "self awareness"],
  openGraph: {
    type: "website",
    siteName: NAME,
    title: `${NAME} | Daily behavior tracker`,
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${NAME} logo` }],
  },
  twitter: {
    card: "summary_large_image",
    title: NAME,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#FDF8E2",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${geistSans.variable} h-full`}>
        <body className="min-h-full flex flex-col">
          {children}
          {/* page-speed numbers from real visits (loads after the page is interactive, collects no personal data) */}
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
