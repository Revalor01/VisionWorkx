import { expect, qa, test } from "../../lib/qa";
import { createModule, EMAIL_FIELD, formConfig, modulesAdmin, NAME_FIELD, resendTestAddress, submitViaApi, waitFor } from "../../lib/modules";

// Emails are sent by revalor-automation from the modules database's event
// queue. We check its send log rather than a real inbox; addresses are
// Resend test addresses (delivered, never a real person).

test.use({ workspaceOptions: { notificationEmail: resendTestAddress("qaowner") } });

qa(
  {
    id: "visionworkx/emails/confirmation-and-owner-alert",
    area: "Emails",
    title: "Customer confirmation and owner alert are sent",
    requires: ["automation"],
  },
  async ({ request, qaWorkspace }) => {
    test.setTimeout(8 * 60_000); // the automation service works through its queue on a schedule
    const mod = await createModule(qaWorkspace.id, "lead_capture", formConfig([NAME_FIELD, EMAIL_FIELD]));
    const customer = resendTestAddress(`qacust${Date.now().toString(36)}`);
    const r = await submitViaApi(request, mod.publicId, { data: { name: "QA Email Visitor", email: customer } });
    expect(r.status, JSON.stringify(r.json)).toBe(200);

    const log = await waitFor(
      async () => {
        const { data } = await modulesAdmin().from("vw_email_log").select("kind, to_email, status, error").eq("workspace_id", qaWorkspace.id);
        const kinds = new Set((data ?? []).map((e) => e.kind));
        return kinds.has("customer_confirmation") && kinds.has("owner_alert") ? data : null;
      },
      "both emails in the send log",
      7 * 60_000,
    );
    const confirmation = log!.find((e) => e.kind === "customer_confirmation")!;
    const alert = log!.find((e) => e.kind === "owner_alert")!;
    expect(confirmation.to_email).toBe(customer);
    expect(confirmation.status, confirmation.error ?? "").toBe("sent");
    expect(alert.to_email).toBe(resendTestAddress("qaowner"));
    expect(alert.status, alert.error ?? "").toBe("sent");
  },
);
