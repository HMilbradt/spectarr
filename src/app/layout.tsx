import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/lib/providers";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spectarr",
  description: "Identify DVDs, Blu-rays, TV box sets, vinyl records, and video games from shelf photographs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <TooltipProvider>
            <Nav />
            <main className="md:ml-56 pb-20 md:pb-8">
              <div className="max-w-5xl mx-auto px-4 py-6">
                {children}
              </div>
            </main>
            <Toaster />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
