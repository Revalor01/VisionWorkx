import Link from "next/link";
import { notFound } from "next/navigation";
import { getPreviewByToken } from "@/lib/apps/preview";
import TryStatusClient from "./TryStatusClient";

export const metadata = { title: "Your Vision Workx preview" };

export default async function TryStatusPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const preview = await getPreviewByToken(token);
  if (!preview) notFound();

  return (
    <main className="min-h-screen bg-off-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold text-navy-dark">
            Vision Workx
          </Link>
          <Link href="/login" className="text-sm text-navy hover:underline">
            Log in
          </Link>
        </div>
      </header>

      <TryStatusClient
        token={token}
        initial={{
          name: preview.name,
          status: preview.status,
          deployUrl: preview.deployUrl,
          expiresAt: preview.expiresAt,
          claimed: preview.claimed,
          email: preview.email,
        }}
      />
    </main>
  );
}
