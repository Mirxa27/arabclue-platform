import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ibmArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-arabic",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "منصة مناقصة | Etimad AI-Bidder",
  description:
    "AI-powered SaaS platform for generating compliant Saudi Etimad procurement proposals. NCA, PDPL & EA compliant. Vision 2030 aligned.",
  keywords: [
    "Etimad",
    "مناقصة",
    "Saudi procurement",
    "PDPL",
    "NCA",
    "Vision 2030",
    "RFP",
    "proposal generation",
  ],
  authors: [{ name: "Etimad AI-Bidder" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Etimad AI-Bidder | منصة مناقصة",
    description: "AI-powered compliant Saudi procurement proposal generator",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${ibmArabic.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <SonnerToaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
