import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import GenerateClient from "./GenerateClient";

function GenerateSkeleton() {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <div className="h-16 bg-navy-dark" />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        <div className="h-8 w-64 bg-gray-200 rounded-xl animate-pulse mx-auto mb-8" />
        <div className="h-2 w-full bg-gray-200 rounded-full animate-pulse mb-10" />
        <div className="bg-navy-dark rounded-2xl min-h-72 animate-pulse" />
      </main>
    </div>
  );
}

export default async function GeneratePage() {
  const supabase = createServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, full_name")
    .eq("id", user.id)
    .single();

  return (
    <Suspense fallback={<GenerateSkeleton />}>
      <GenerateClient
        userName={profile?.full_name ?? null}
        plan={(profile?.plan ?? "free") as import("@/lib/database.types").Plan}
      />
    </Suspense>
  );
}
