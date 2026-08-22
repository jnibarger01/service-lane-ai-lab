import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Service Lane AI Lab | Governed AI Experiments for Fixed Operations",
  description:
    "A hands-on laboratory for testing, measuring, and governing AI workflows in the automotive service lane.",
  metadataBase: new URL("https://service-lane-ai-lab.jacenibarger.chatgpt.site"),
  openGraph: {
    title: "Service Lane AI Lab",
    description:
      "Prove the workflow before it reaches the lane. Structured experiments, source evidence, human approvals, and measurable outcomes.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Service Lane AI Lab — governed experiments for automotive fixed operations",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Service Lane AI Lab",
    description:
      "Governed AI experiments for automotive fixed operations.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
        {children}
      </body>
    </html>
  );
}
