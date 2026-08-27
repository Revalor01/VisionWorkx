"use client";

import { useState } from "react";
import AppNavbar from "@/components/nav/AppNavbar";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { Plan } from "@/lib/database.types";

interface OptInState {
  phone: string;
  consentedAt: string;
}

// This screen (specifically the checkbox copy below) is the real opt-in
// flow Twilio's Toll-Free Verification asks for evidence of — message
// frequency disclosure, "msg & data rates", STOP/HELP instructions, and a
// link out to the Privacy Policy are all required elements of a compliant
// SMS consent flow, not decoration.
export default function NotificationsClient({
  userName,
  plan,
  userEmail,
  initialOptIn,
}: {
  userName: string | null;
  plan: Plan;
  userEmail: string | null;
  initialOptIn: OptInState | null;
}) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [phone, setPhone] = useState(initialOptIn?.phone ?? "");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const phoneValid = /^\+?[1-9]\d{9,14}$/.test(phone.replace(/[\s()-]/g, ""));

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const normalized = phone.replace(/[\s()-]/g, "");
      const e164 = normalized.startsWith("+") ? normalized : `+1${normalized}`;

      const { data, error: upsertError } = await supabase
        .from("sms_opt_ins")
        .upsert({ user_id: user.id, phone: e164, consented_at: new Date().toISOString() }, { onConflict: "user_id" })
        .select("phone, consented_at")
        .single();
      if (upsertError) throw upsertError;

      setOptIn({ phone: data.phone, consentedAt: data.consented_at });
      setAgreed(false);
      setMessage("You're opted in to SMS updates.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError("");
    setMessage("");
    try {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { error: deleteError } = await supabase.from("sms_opt_ins").delete().eq("user_id", user.id);
      if (deleteError) throw deleteError;

      setOptIn(null);
      setPhone("");
      setMessage("You've been removed from SMS updates.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={userName} plan={plan} userEmail={userEmail} />
      <main className="max-w-2xl mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Notifications</h1>
        <p className="text-gray-500 text-sm mb-8">Choose how VisionWorkx can reach you.</p>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Text message updates</h2>
          <p className="text-sm text-gray-500 mb-4">
            Get texted about important account activity — app deployments, billing issues, and occasional product
            updates.
          </p>

          {optIn ? (
            <div className="mb-4">
              <div className="flex items-center justify-between rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-green-800">SMS updates on</p>
                  <p className="text-xs text-green-700 mt-0.5">{optIn.phone}</p>
                </div>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Turn off"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone number</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
              />

              <label className="flex items-start gap-2 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs text-gray-600">
                  I agree to receive SMS text messages from VisionWorkx (Revalor LLC) at the phone number provided,
                  including account and product updates. Message frequency varies. Msg &amp; data rates may apply.
                  Reply STOP to unsubscribe at any time, or HELP for help. Consent is not a condition of purchase.
                  See our{" "}
                  <a href="/privacy" target="_blank" className="underline">
                    Privacy Policy
                  </a>{" "}
                  and{" "}
                  <a href="/terms" target="_blank" className="underline">
                    Terms
                  </a>
                  .
                </span>
              </label>

              {error && <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
              {message && <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{message}</div>}

              <button
                onClick={handleSave}
                disabled={saving || !phoneValid || !agreed}
                className="px-4 py-2 rounded-lg bg-navy-dark text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Saving…" : "Opt in to SMS updates"}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
