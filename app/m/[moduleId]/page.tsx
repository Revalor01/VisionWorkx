import type { Metadata } from "next";
import { getModuleByPublicId } from "@/lib/modules/data";
import { modulesConfigured } from "@/lib/modules/supabase";
import ModuleForm from "@/components/modules/ModuleForm";
import { resolveBrand } from "@/lib/modules/config";

// Rendered inside the embed iframe on client websites. Which sites may frame
// it is enforced by a CSP frame-ancestors header set in middleware.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Form", robots: { index: false, follow: false } };

export default async function ModuleFramePage(props: {
  params: Promise<{ moduleId: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const { moduleId } = await props.params;
  const { src } = await props.searchParams;
  const mod = modulesConfigured() ? await getModuleByPublicId(moduleId) : null;

  if (!mod || mod.status !== "live") {
    return (
      <p style={{ font: "14px system-ui, sans-serif", color: "#6a7285", padding: 16, margin: 0 }}>
        This form isn&apos;t available right now.
      </p>
    );
  }
  if (mod.type !== "lead_capture" && mod.type !== "intake_form") {
    return (
      <p style={{ font: "14px system-ui, sans-serif", color: "#6a7285", padding: 16, margin: 0 }}>
        This module type is coming soon.
      </p>
    );
  }
  const sourceUrl = typeof src === "string" && /^https?:\/\//.test(src) ? src.slice(0, 500) : null;
  return (
    <ModuleForm
      publicId={mod.publicId}
      businessName={mod.workspaceName}
      logoUrl={mod.logoUrl}
      brand={resolveBrand(mod.brand, mod.config.style)}
      config={mod.config}
      sourceUrl={sourceUrl}
    />
  );
}
