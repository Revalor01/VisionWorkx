"use client";

import type { ReactNode } from "react";

// Wraps every /admin page body in revalor-admin's dark command-center look
// (command-theme.css), Needs Analyzer included (client mode too). The theme is
// screen-only, so anything printed (proposals, the simulator assessment) still
// comes out light.
export default function AdminDeck({ children }: { children: ReactNode }) {
  return <div className="odin-deck page-deck min-h-screen">{children}</div>;
}
