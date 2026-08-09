"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#categories", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#why-choose-us", label: "Why Us" },
  { href: "/blog", label: "Blog" },
  { href: "/login", label: "Log in" },
];

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-gray-100 text-navy-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center relative h-14 md:h-auto md:py-4">
          <nav className="hidden md:flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-medium text-gray-600">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap hover:text-navy-dark focus-visible:text-navy-dark hover:[text-shadow:0_0_10px_rgba(26,58,92,0.6)] focus-visible:[text-shadow:0_0_10px_rgba(26,58,92,0.6)] transition-all"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Mobile menu toggle — keeps the sticky bar to one compact line on small screens */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            className="md:hidden absolute right-0 p-1.5 rounded-lg hover:bg-black/5 text-gray-600 hover:text-navy-dark transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              {mobileMenuOpen ? (
                <path d="M18 6 6 18M6 6l12 12" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" />
              )}
            </svg>
          </button>

          <span className="md:hidden text-sm font-semibold text-navy-dark">Menu</span>
        </div>

        {/* Mobile nav links */}
        {mobileMenuOpen && (
          <nav className="md:hidden flex flex-col gap-1 pb-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium text-gray-600 hover:text-navy-dark hover:bg-gray-200 hover:[text-shadow:0_0_10px_rgba(26,58,92,0.6)] px-3 py-2 rounded-lg transition-all"
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
