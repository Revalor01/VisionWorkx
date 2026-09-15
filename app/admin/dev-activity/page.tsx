import { redirect } from "next/navigation";

// dev_activity_log lives in this project's own Supabase database, but
// revalor-admin/dev-activity reads the same table cross-project (see
// revalor-admin/lib/devActivityLog.ts) and is now the one canonical copy of
// this page - this used to duplicate it exactly.
export default function DevActivityPage() {
  redirect("https://revalor-admin.vercel.app/dev-activity");
}
