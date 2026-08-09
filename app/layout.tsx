import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app";
const TITLE = "Vision Workx — AI-Powered Apps for Small Businesses";
const DESCRIPTION =
  "Describe the app you need in plain English. We build and deploy it in days — no code, no agency.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Vision Workx",
    images: [{ url: "/VisionWorks.png", width: 1024, height: 1024 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/VisionWorks.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-off-white`}>
        {children}
      </body>
    </html>
  );
}
