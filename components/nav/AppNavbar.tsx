"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { Plan } from "@/lib/database.types";

const PLAN_COLORS: Record<Plan, string> = {
  free: "bg-gray-500",
  starter: "bg-blue-500",
  growth: "bg-purple-500",
  pro: "bg-amber-500",
};

const ADMIN_EMAIL = "sawilliams721@gmail.com";

export default function AppNavbar({
  userName,
  plan,
  userEmail,
}: {
  userName: string | null;
  plan: Plan;
  userEmail?: string | null;
}) {
  const isAdmin = userEmail === ADMIN_EMAIL;
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/billing", label: "Billing" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="bg-navy-dark text-white sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 shrink-0"
          >
            <span className="text-lg font-bold tracking-tight">
              Vision Workx
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    active
                      ? "bg-blue-900/60 text-white"
                      : "text-blue-100 hover:text-white hover:bg-blue-900/40"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white ${PLAN_COLORS[plan]}`}
            >
              {plan === "free" ? "Trial" : plan}
            </span>

            {userName && (
              <span className="text-sm text-blue-200 hidden md:block max-w-[120px] truncate">
                {userName}
              </span>
            )}

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-xs font-medium bg-white/10 hover:bg-white/20 text-blue-100 hover:text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {loggingOut ? "…" : "Log out"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
