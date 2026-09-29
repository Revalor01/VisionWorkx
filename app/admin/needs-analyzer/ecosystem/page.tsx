import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { loadSettings, naDb } from "@/lib/needsAnalyzer/db";
import EcosystemEditor from "../EcosystemEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ecosystem · Needs Analyzer", robots: { index: false, follow: false } };

export default async function EcosystemPage() {
  if (!(await isOperator())) redirect("/dashboard");
  const { catalog, ecosystem } = await loadSettings(naDb());
  return <EcosystemEditor catalog={catalog} initial={ecosystem} />;
}
