"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// Wraps every /admin page body in revalor-admin's dark command-center look
// (command-theme.css). Needs Analyzer stays light: clients see it (client mode)
// and its proposals are printed.
export default function AdminDeck({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  if (path.startsWith("/admin/needs-analyzer")) return <>{children}</>;
  return <div className="odin-deck page-deck min-h-screen">{children}</div>;
}
