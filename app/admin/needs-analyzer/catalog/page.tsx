import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { loadSettings, naDb } from "@/lib/needsAnalyzer/db";
import CatalogEditor from "../CatalogEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catalog & pricing · Needs Analyzer", robots: { index: false, follow: false } };

export default async function CatalogPage() {
  if (!(await isOperator())) redirect("/dashboard");
  const { catalog, ecosystem } = await loadSettings(naDb());
  return <CatalogEditor initial={catalog} ecosystem={ecosystem} />;
}
