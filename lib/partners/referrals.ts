import { createServiceClient } from "@/lib/supabase";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids visual ambiguity

export function generateReferralCode(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `VW-${suffix}`;
}

// Additive bonus on top of the immutable agreement's discount_percentage —
// deliberately not a tier change (see migration 21's header comment for why).
const REFERRALS_PER_BONUS_STEP = 3;
const BONUS_PERCENTAGE_PER_STEP = 5;
const MAX_BONUS_PERCENTAGE = 20;

export function calculateReferralBonus(convertedCount: number): number {
  return Math.min(Math.floor(convertedCount / REFERRALS_PER_BONUS_STEP) * BONUS_PERCENTAGE_PER_STEP, MAX_BONUS_PERCENTAGE);
}

export async function recalculateReferralBonus(
  service: ReturnType<typeof createServiceClient>,
  partnerApplicationId: string,
): Promise<void> {
  const { count } = await service
    .from("partner_referrals")
    .select("id", { count: "exact", head: true })
    .eq("partner_application_id", partnerApplicationId)
    .eq("status", "converted");

  const convertedCount = count ?? 0;

  await service
    .from("partner_applications")
    .update({
      converted_referral_count: convertedCount,
      referral_bonus_discount_percentage: calculateReferralBonus(convertedCount),
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerApplicationId);
}
