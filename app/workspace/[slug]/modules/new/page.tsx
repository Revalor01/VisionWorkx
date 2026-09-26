import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/modules/workspace";
import { parseBrand } from "@/lib/modules/config";
import FormBuilder from "@/components/modules/FormBuilder";

export default async function NewLeadFormPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { workspace, role } = await requireWorkspace(slug);
  if (role !== "owner") redirect(`/workspace/${slug}/modules`);
  return (
    <FormBuilder
      slug={workspace.slug}
      businessName={workspace.name}
      logoUrl={workspace.logo_url}
      workspaceBrand={parseBrand(workspace.brand)}
      hasDomains={workspace.domains.length > 0}
    />
  );
}
