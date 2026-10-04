import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { THEME_COLOR, THEME_SCRIPT } from "@/lib/theme";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

// Clerk's sign-in card and avatar menu take the app's colours, so they follow light / dark too
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--color-ink)",
    colorBackground: "var(--color-surface)",
    colorText: "var(--color-ink)",
    colorTextSecondary: "var(--color-soft)",
    colorTextOnPrimaryBackground: "var(--color-cream)",
    colorInputBackground: "var(--color-surface)",
    colorInputText: "var(--color-ink)",
    colorNeutral: "var(--color-ink)",
    colorDanger: "var(--color-danger)",
    colorSuccess: "var(--color-good)",
    borderRadius: "1rem",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      {/* data-theme is set by the script below before anything is drawn, so React must leave it alone */}
      <html lang="en" data-theme="light" suppressHydrationWarning className={`${geistSans.variable} h-full`}>
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        </head>
        <body className="min-h-full flex flex-col">
          {children}
          {/* page-speed numbers from real visits (loads after the page is interactive, collects no personal data) */}
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
