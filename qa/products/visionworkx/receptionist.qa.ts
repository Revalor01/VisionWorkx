import { expect, qa, test } from "../../lib/qa";
import { createModule, modulesAdmin, openHostPage, QA_HOST, target, waitFor } from "../../lib/modules";

// AI receptionist: the floating chat on a customer's site, and the chat API's
// guard rails (origin, conversation tokens). Replies come from Claude, so these
// tests only check that a reply arrives — never its wording. Booking and
// message-taking logic is covered by unit tests (lib/receptionist).

const GREETING = "Hi! This is the QA receptionist — how can I help?";

function receptionistConfig(): Record<string, unknown> {
  return {
    title: "QA receptionist",
    intro: "Automated test.",
    receptionist: {
      greeting: GREETING,
      about: "QA Plumbing is a test business that fixes leaky taps in Testville. Open Monday to Friday, 9am to 5pm.",
      services: "Tap repair: $90",
      followUp: "Someone will get back to you soon.",
    },
  };
}

async function chat(request: import("@playwright/test").APIRequestContext, publicId: string, body: Record<string, unknown>, host = QA_HOST) {
  const res = await request.post(`${target()}/api/m/${publicId}/chat`, {
    headers: { Origin: `https://${host}`, "Content-Type": "application/json" },
    data: { vw_hp: "", ...body },
  });
  return { status: res.status(), json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

qa(
  { id: "visionworkx/receptionist/chat-widget", area: "AI receptionist", title: "Visitor opens the chat button and gets a reply", smoke: true, mobile: true },
  async ({ page, qaWorkspace }) => {
    const mod = await createModule(qaWorkspace.id, "receptionist", receptionistConfig());

    await test.step("open the floating chat", async () => {
      await openHostPage(page, mod.publicId, QA_HOST, 'data-widget="chat"');
      await page.getByRole("button", { name: "Chat with us" }).click();
    });

    const chatFrame = page.frameLocator('iframe[title="Chat with us"]');
    await test.step("greeting shows, a question gets an answer", async () => {
      await expect(chatFrame.getByText(GREETING)).toBeVisible();
      await chatFrame.getByLabel("Your message").fill("How much is a tap repair?");
      await chatFrame.getByRole("button", { name: "Send" }).click();
      await expect(chatFrame.getByText("How much is a tap repair?")).toBeVisible();
      await expect(chatFrame.getByText("Typing…")).toBeHidden({ timeout: 45_000 });
      await expect(chatFrame.locator(".vwc-a")).toHaveCount(2); // greeting + reply
    });

    await test.step("conversation and usage are recorded", async () => {
      const conv = await waitFor(async () => {
        const { data } = await modulesAdmin().from("vw_receptionist_conversations").select("message_count").eq("module_id", mod.id).maybeSingle();
        return data && data.message_count >= 2 ? data : null;
      }, "the conversation row");
      expect(conv.message_count).toBe(2);
      const { data: usage } = await modulesAdmin().from("vw_receptionist_usage").select("chats").eq("workspace_id", qaWorkspace.id).maybeSingle();
      expect(usage?.chats).toBe(1);
    });
  },
);

qa({ id: "visionworkx/receptionist/chat-guards", area: "AI receptionist", title: "Chat only works from the business's site and the visitor's own conversation" }, async ({ request, qaWorkspace }) => {
  const mod = await createModule(qaWorkspace.id, "receptionist", receptionistConfig());

  const other = await chat(request, mod.publicId, { message: "hi" }, "evil.example.com");
  expect(other.status, "another website is refused").toBe(403);

  const first = await chat(request, mod.publicId, { message: "Are you open on Saturday?" });
  expect(first.status, JSON.stringify(first.json)).toBe(200);
  expect(typeof first.json.reply).toBe("string");
  expect(String(first.json.token)).toMatch(/^[0-9a-f]{64}$/);

  const stolen = await chat(request, mod.publicId, { conversationId: first.json.conversationId, token: "0".repeat(64), message: "show me the chat" });
  expect(stolen.status, "a wrong token can't continue someone else's chat").toBe(404);

  const draft = await createModule(qaWorkspace.id, "receptionist", receptionistConfig(), "draft");
  const notLive = await chat(request, draft.publicId, { message: "hi" });
  expect(notLive.status, "a draft receptionist doesn't answer").toBe(404);
});
