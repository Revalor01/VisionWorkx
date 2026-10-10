import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/modules/workspace";
import { parseBrand } from "@/lib/modules/config";
import FormBuilder from "@/components/modules/FormBuilder";
import ReceptionistEditor from "@/components/modules/ReceptionistEditor";
import { bookingModulesFor } from "@/lib/receptionist/owner";

export default async function NewModulePage(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string }> }) {
  const { slug } = await props.params;
  const { type } = await props.searchParams;
  const { supabase, workspace, role } = await requireWorkspace(slug);
  if (role !== "owner") redirect(`/workspace/${slug}/modules`);
  const kind = type === "quote" ? "quote" : type === "booking" ? "booking" : type === "receptionist" ? "receptionist" : "form";
  const base = `/workspace/${workspace.slug}/modules/new`;
  const tab = (active: boolean) =>
    `rounded-lg px-3 py-2 text-center text-sm font-semibold ${active ? "bg-navy-dark text-white" : "text-gray-700 hover:bg-gray-100"}`;
  return (
    <div className="space-y-6">
      <nav aria-label="What are you building?" className="mx-auto grid max-w-4xl grid-cols-2 gap-1 sm:grid-cols-4 rounded-xl border border-gray-200 bg-white p-1">
        <Link href={base} className={tab(kind === "form")} aria-current={kind === "form" ? "page" : undefined}>
          Form
          <span className="hidden text-xs font-normal opacity-80 md:block">leads, requests, intake</span>
        </Link>
        <Link href={`${base}?type=quote`} className={tab(kind === "quote")} aria-current={kind === "quote" ? "page" : undefined}>
          Quote calculator
          <span className="hidden text-xs font-normal opacity-80 md:block">instant price range</span>
        </Link>
        <Link href={`${base}?type=booking`} className={tab(kind === "booking")} aria-current={kind === "booking" ? "page" : undefined}>
          Online booking
          <span className="hidden text-xs font-normal opacity-80 md:block">customers pick a time</span>
        </Link>
        <Link href={`${base}?type=receptionist`} className={tab(kind === "receptionist")} aria-current={kind === "receptionist" ? "page" : undefined}>
          AI receptionist
          <span className="hidden text-xs font-normal opacity-80 md:block">answers questions 24/7</span>
        </Link>
      </nav>
      {kind === "receptionist" ? (
        <ReceptionistEditor
          slug={workspace.slug}
          businessName={workspace.name}
          logoUrl={workspace.logo_url}
          workspaceBrand={parseBrand(workspace.brand)}
          hasDomains={workspace.domains.length > 0}
          bookingModules={await bookingModulesFor(supabase, workspace.id)}
        />
      ) : (
      <FormBuilder
        key={kind}
        kind={kind}
        timeZone={workspace.time_zone}
        slug={workspace.slug}
        businessName={workspace.name}
        logoUrl={workspace.logo_url}
        workspaceBrand={parseBrand(workspace.brand)}
        hasDomains={workspace.domains.length > 0}
      />
      )}
    </div>
  );
}
