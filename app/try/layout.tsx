import { createServerClient } from "@/lib/supabase";
import { canUseFullAppGeneration } from "@/lib/featureFlags";
import GenerationPaused from "@/components/GenerationPaused";

// Full-app generation freeze (lib/featureFlags.ts): the /try flow starts app
// builds, so it shows the paused notice unless the builder is on (or the
// signed-in user is the operator).
export default async function TryLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!canUseFullAppGeneration(user?.email)) return <GenerationPaused backHref="/" />;
  return <>{children}</>;
}
