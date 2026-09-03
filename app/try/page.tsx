import { Suspense } from "react";
import Link from "next/link";
import TryForm from "./TryForm";

export const metadata = {
  title: "Try Vision Workx — build an app in minutes",
};

export default function TryPage() {
  return (
    <main className="min-h-screen bg-off-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold text-navy-dark">
            Vision Workx
          </Link>
          <Link href="/login" className="text-sm text-navy hover:underline">
            Log in
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold text-navy-dark">
          Describe your app. Watch it get built.
        </h1>
        <p className="mt-2 text-gray-600">
          No account, no card. We&apos;ll generate a working app and deploy it live — you can
          claim it when you&apos;re ready.
        </p>

        <Suspense>
          <TryForm />
        </Suspense>
      </div>
    </main>
  );
}
