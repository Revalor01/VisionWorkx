import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Vision Workx — AI-Powered Apps for Small Businesses",
  description:
    "Describe the app you need in plain English. We build and deploy it in days — no code, no agency.",
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
