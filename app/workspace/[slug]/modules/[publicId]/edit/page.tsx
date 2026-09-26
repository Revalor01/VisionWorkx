import { notFound, redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/modules/workspace";
import { parseBrand, parseFormConfig } from "@/lib/modules/config";
import FormBuilder from "@/components/modules/FormBuilder";

export default async function EditLeadFormPage(props: { params: Promise<{ slug: string; publicId: string }> }) {
  const { slug, publicId } = await props.params;
  const { supabase, workspace, role } = await requireWorkspace(slug);
  if (role !== "owner") redirect(`/workspace/${slug}/modules`);
  const { data: mod } = await supabase
    .from("vw_modules")
    .select("public_id, name, status, type, config")
    .eq("workspace_id", workspace.id)
    .eq("public_id", publicId)
    .maybeSingle();
  if (!mod || (mod.type !== "lead_capture" && mod.type !== "intake_form")) notFound();
  return (
    <FormBuilder
      slug={workspace.slug}
      businessName={workspace.name}
      logoUrl={workspace.logo_url}
      workspaceBrand={parseBrand(workspace.brand)}
      hasDomains={workspace.domains.length > 0}
      existing={{ publicId: mod.public_id, name: mod.name, status: mod.status, config: parseFormConfig(mod.config) }}
    />
  );
}
