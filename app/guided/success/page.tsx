import Link from "next/link";
import GuidedSuccessClient from "./GuidedSuccessClient";

export default async function GuidedSuccessPage(props: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await props.searchParams;

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="text-2xl font-bold text-navy-dark">
          Vision Workx
        </Link>
        {session_id ? (
          <GuidedSuccessClient sessionId={session_id} />
        ) : (
          <p className="mt-8 text-sm text-gray-600">
            Missing session reference.{" "}
            <Link href="/guided" className="text-navy underline">
              Start again
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
