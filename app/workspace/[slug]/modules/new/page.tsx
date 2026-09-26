import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/modules/workspace";
import { parseBrand } from "@/lib/modules/config";
import FormBuilder from "@/components/modules/FormBuilder";

export default async function NewModulePage(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string }> }) {
  const { slug } = await props.params;
  const { type } = await props.searchParams;
  const { workspace, role } = await requireWorkspace(slug);
  if (role !== "owner") redirect(`/workspace/${slug}/modules`);
  const kind = type === "quote" ? "quote" : type === "booking" ? "booking" : "form";
  const base = `/workspace/${workspace.slug}/modules/new`;
  const tab = (active: boolean) =>
    `rounded-lg px-3 py-2 text-center text-sm font-semibold ${active ? "bg-navy-dark text-white" : "text-gray-700 hover:bg-gray-100"}`;
  return (
    <div className="space-y-6">
      <nav aria-label="What are you building?" className="mx-auto grid max-w-3xl grid-cols-3 gap-1 rounded-xl border border-gray-200 bg-white p-1">
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
      </nav>
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
    </div>
  );
}
