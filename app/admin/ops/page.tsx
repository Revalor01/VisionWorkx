import { redirect } from "next/navigation";

// This page used to duplicate revalor-admin's /ops (same Supabase/Vercel
// project-state data, ported here and never reconciled). revalor-admin/ops
// is now the one canonical copy, and it also has Vercel spend that this
// version never did.
export default function AdminOpsPage() {
  redirect("https://revalor-admin.vercel.app/ops");
}
