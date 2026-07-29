import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { rootMetadata } from "@/lib/seo";
import { LOCALE_COOKIE_NAME } from "@/lib/store";

/** Mirrors next-themes class strategy: swap `light`/`dark` on <html> before paint. */
const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,c=d.classList;c.remove('light','dark');var e=localStorage.getItem('theme');var t=(!e||e==='system')?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):e;c.add(t);d.style.colorScheme=t;}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-arabic",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = rootMetadata;

/** Locale is cookie-driven; keep the document shell request-dynamic. */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale = localeCookie === "en" ? "en" : "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${ibmArabic.variable} antialiased bg-background text-foreground`}
      >
        <Script id="arabclue-theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ThemeProvider>
          <AuthSessionProvider>
            <QueryProvider>
              {children}
            </QueryProvider>
          </AuthSessionProvider>
          <Toaster />
          <SonnerToaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
