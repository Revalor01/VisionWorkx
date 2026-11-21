import type { ReactNode } from "react";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { loadRevalorNav } from "@/lib/revalorNav";
import RevalorTopBar from "./RevalorTopBar";

// Every /admin page gets the shared Revalor admin top bar (same as
// revalor-admin's), its links read live from revalor-admin's /api/nav.
// Only the owner (real session or admin SSO cookie) sees it: the link list is
// Revalor's internal map, and non-owners (e.g. Social editors) never need it.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await isAdminRequest().catch(() => false);
  return (
    <>
      {admin && <RevalorTopBar nav={await loadRevalorNav()} />}
      {children}
    </>
  );
}
