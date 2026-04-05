import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "./ConvexClientProvider";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hearo.henryai.studio"),
  title: {
    default: "Hearo | Real-Time AI Audio Transcription & Translation",
    template: "%s | Hearo"
  },
  description: "Experience world-class real-time transcription and translation. Our offline-first AI turns your microphone into an $800 studio setup with zero lag and perfect global sync.",
  keywords: ["AI transcription", "real-time translation", "live captions", "meeting notes", "speech to text AI", "multi-language live translate", "Hearo", "HenryAI"],
  authors: [{ name: "HenryAI Studio" }],
  creator: "HenryAI",
  publisher: "HenryAI Studio",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://hearo.henryai.studio",
    siteName: "Hearo",
    title: "Hearo | Real-Time AI Audio Transcription & Translation",
    description: "Experience world-class real-time transcription and translation. Turn your microphone into a pro studio with zero lag.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Hearo Dashboard Demo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hearo | Real-Time AI Audio Transcription & Translation",
    description: "Real-time translation and perfect AI transcription locally right from your browser.",
    images: ["/og-image.png"],
    creator: "@henryai",
  },
  alternates: {
    canonical: "https://hearo.henryai.studio",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
          <Toaster theme="system" position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
