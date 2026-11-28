"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// Wraps every /admin page body in revalor-admin's dark command-center look
// (command-theme.css). Needs Analyzer stays light (clients see it in client
// mode and its proposals are printed), except its operator tools: the Website
// Build Simulator and Website check. The theme is screen-only, so anything
// printed from these pages still comes out light.
const DECK_NA = ["/admin/needs-analyzer/simulator", "/admin/needs-analyzer/website"];

export default function AdminDeck({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  if (path.startsWith("/admin/needs-analyzer") && !DECK_NA.some((p) => path === p || path.startsWith(`${p}/`))) return <>{children}</>;
  return <div className="odin-deck page-deck min-h-screen">{children}</div>;
}
