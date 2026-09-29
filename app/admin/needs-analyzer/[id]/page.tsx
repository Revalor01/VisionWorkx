import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { getAssessment, loadSettings, naDb } from "@/lib/needsAnalyzer/db";
import Workspace from "../Workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Needs Analyzer", robots: { index: false, follow: false } };

export default async function AssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; section?: string }>;
}) {
  if (!(await isOperator())) redirect("/dashboard");
  const db = naDb();
  const [assessment, { catalog, ecosystem }] = await Promise.all([getAssessment(db, (await params).id), loadSettings(db)]);
  if (!assessment) notFound();
  const { tab, section } = await searchParams;
  return <Workspace initial={assessment} catalog={catalog} ecosystem={ecosystem} initialTab={tab} initialSection={section} />;
}
