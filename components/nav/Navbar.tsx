"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const NAV_LINKS = [
  { href: "/web-app-vs-web-page", label: "Web App vs. Web Page" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#categories", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#why-choose-us", label: "Why Choose Us" },
  { href: "/#contact", label: "Contact Us" },
];

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-gray-100 text-navy-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="bg-white border border-gray-200 rounded-lg p-1.5 flex items-center justify-center shrink-0">
                <Image src="/VisionWorks.png" alt="Vision Workx" width={48} height={48} className="rounded-sm" />
              </span>
              <span className="text-xl font-bold tracking-tight">Vision Workx</span>
            </Link>
            <a
              href="https://revalor-automation.vercel.app/"
              className="text-xs text-gray-500 hover:text-navy-dark transition-colors hidden sm:block"
            >
              by Revalor
            </a>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-navy-dark transition-colors">
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-navy-dark transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold bg-navy text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Start Free Trial
            </Link>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              className="md:hidden p-1.5 rounded-lg hover:bg-black/5 text-gray-600 hover:text-navy-dark transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                {mobileMenuOpen ? (
                  <path d="M18 6 6 18M6 6l12 12" />
                ) : (
                  <path d="M3 6h18M3 12h18M3 18h18" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav links */}
        {mobileMenuOpen && (
          <nav className="md:hidden flex flex-col gap-1 pb-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium text-gray-600 hover:text-navy-dark hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
