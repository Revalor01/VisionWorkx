import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { listAssessments, loadSettings, naDb } from "@/lib/needsAnalyzer/db";
import Home from "./Home";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Needs Analyzer", robots: { index: false, follow: false } };

// Revalor Needs Analyzer (online copy of the offline sales tool): every business
// assessed, with ecosystem gaps.
export default async function NeedsAnalyzerPage() {
  if (!(await isOperator())) redirect("/dashboard");
  const db = naDb();
  const [list, { catalog, ecosystem }] = await Promise.all([listAssessments(db), loadSettings(db)]);
  return <Home initial={list} catalog={catalog} ecosystem={ecosystem} />;
}
