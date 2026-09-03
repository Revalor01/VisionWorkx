"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";
import { automationsForCategories } from "@/lib/apps/automations";
import type {
  AppCategory,
  AutomationChannel,
  AutomationWorkflow,
} from "@/lib/database.types";

interface Usage {
  email: { sent: number; limit: number };
  sms: { sent: number; limit: number };
}

export default function AutomationsPanel({
  appId,
  appCategory,
  secondaryCategories = [],
  initialWorkflows,
  smsAvailable,
  usage,
}: {
  appId: string;
  appCategory: AppCategory;
  secondaryCategories?: AppCategory[];
  initialWorkflows: AutomationWorkflow[];
  smsAvailable: boolean;
  usage: Usage;
}) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const defs = automationsForCategories([appCategory, ...secondaryCategories]);
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>(initialWorkflows);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  function wf(triggerType: string, actionType: string) {
    return workflows.find(
      (w) => w.trigger_type === triggerType && w.action_type === actionType,
    );
  }

  async function upsert(
    triggerType: string,
    actionType: string,
    patch: { enabled?: boolean; channel?: AutomationChannel },
  ) {
    const key = triggerType;
    setSavingKey(key);
    setError("");
    const existing = wf(triggerType, actionType);
    const { data, error: err } = await supabase
      .from("automation_workflows")
      .upsert(
        {
          app_id: appId,
          trigger_type: triggerType,
          action_type: actionType,
          enabled: patch.enabled ?? existing?.enabled ?? false,
          channel: patch.channel ?? existing?.channel ?? "email",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "app_id,trigger_type,action_type" },
      )
      .select()
      .single();
    if (err) setError(err.message);
    else if (data)
      setWorkflows((prev) => [
        ...prev.filter((w) => w.id !== (data as AutomationWorkflow).id),
        data as AutomationWorkflow,
      ]);
    setSavingKey(null);
  }

  if (defs.length === 0) return null;

  const emailNear = usage.email.sent >= usage.email.limit * 0.8;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="font-semibold text-navy-dark mb-1">Automations</h2>
      <p className="text-xs text-gray-400 mb-4">
        Messages your app sends your customers automatically. Toggle any of these on or off — no
        redeploy needed.
      </p>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      <div className="space-y-2">
        {defs.map((d) => {
          const row = wf(d.trigger_type, d.action_type);
          const enabled = row?.enabled ?? false;
          const channel = (row?.channel ?? "email") as AutomationChannel;
          const canSms = d.channels.includes("sms") && smsAvailable;
          const saving = savingKey === d.trigger_type;
          return (
            <div
              key={d.trigger_type}
              className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy-dark">{d.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>
                {enabled && d.channels.length > 1 && (
                  <div className="mt-2 inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => upsert(d.trigger_type, d.action_type, { channel: "email" })}
                      className={`px-2 py-0.5 rounded-md ${channel === "email" ? "bg-navy-dark text-white" : "text-gray-500"}`}
                    >
                      Email
                    </button>
                    <button
                      type="button"
                      disabled={!canSms}
                      title={canSms ? "" : "SMS automations are on Growth and Pro"}
                      onClick={() => upsert(d.trigger_type, d.action_type, { channel: "sms" })}
                      className={`px-2 py-0.5 rounded-md disabled:opacity-40 ${channel === "sms" ? "bg-navy-dark text-white" : "text-gray-500"}`}
                    >
                      SMS
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={d.label}
                disabled={saving}
                onClick={() =>
                  upsert(d.trigger_type, d.action_type, { enabled: !enabled })
                }
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  enabled ? "bg-green-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-[18px]" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <p className={`text-xs mt-4 ${emailNear ? "text-amber-700" : "text-gray-400"}`}>
        {usage.email.sent} / {usage.email.limit} emails
        {usage.sms.limit > 0 && ` · ${usage.sms.sent} / ${usage.sms.limit} texts`} sent this month
        {(usage.email.sent >= usage.email.limit || (usage.sms.limit === 0 && defs.some((d) => d.channels.includes("sms")))) && (
          <>
            {" "}
            <Link href="/billing" className="font-semibold underline">
              Upgrade
            </Link>{" "}
            for more{usage.sms.limit === 0 ? " and to send texts" : ""}.
          </>
        )}
      </p>
    </section>
  );
}
