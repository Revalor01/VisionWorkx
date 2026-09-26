import { notFound, redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/modules/workspace";
import { parseBrand, parseFormConfig } from "@/lib/modules/config";
import FormBuilder from "@/components/modules/FormBuilder";
import { isQuoteModule, parseQuotePricing } from "@/lib/modules/quote";
import { isBookingModule, parseBookingSetup } from "@/lib/modules/booking";

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
  if (!mod || (mod.type !== "lead_capture" && mod.type !== "intake_form" && !isQuoteModule(mod.type) && !isBookingModule(mod.type))) notFound();
  const quote = isQuoteModule(mod.type);
  const booking = isBookingModule(mod.type);
  const raw = mod.config as { quote?: unknown; booking?: unknown } | null;
  return (
    <FormBuilder
      slug={workspace.slug}
      businessName={workspace.name}
      logoUrl={workspace.logo_url}
      workspaceBrand={parseBrand(workspace.brand)}
      hasDomains={workspace.domains.length > 0}
      kind={quote ? "quote" : booking ? "booking" : "form"}
      timeZone={workspace.time_zone}
      existing={{
        publicId: mod.public_id,
        name: mod.name,
        status: mod.status,
        config: quote
          ? { ...parseFormConfig(mod.config), quote: parseQuotePricing(raw?.quote) }
          : booking
            ? { ...parseFormConfig(mod.config), booking: parseBookingSetup(raw?.booking, workspace.time_zone) }
            : parseFormConfig(mod.config),
      }}
    />
  );
}
