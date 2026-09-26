import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/aiUsage", () => ({ logAiUsage: vi.fn() }));

import { parseFormConfig, resolveBrand, validateSubmission, FILE_MAX_BYTES } from "./config";
import { configFromDraft } from "./formFromPrompt";

const MOD = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";
const UP = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("file fields", () => {
  const cfg = parseFormConfig({
    fields: [
      { id: "email", type: "email", required: true, label: "Email" },
      { id: "photo", type: "file", required: true, label: "Photo" },
    ],
  });
  const good = { path: `${MOD}/${UP}/sink.jpg`, name: "sink.jpg", size: 2_000_000, type: "image/jpeg" };

  it("parses file fields", () => {
    expect(cfg.fields[1]).toMatchObject({ id: "photo", type: "file", required: true });
  });
  it("accepts an upload issued for this module", () => {
    const r = validateSubmission(cfg, { email: "a@b.co", photo: good }, MOD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.photo).toEqual(good);
  });
  it("rejects uploads from another module, traversal, bad types and oversize files", () => {
    const bad = [
      { ...good, path: `${OTHER}/${UP}/sink.jpg` },
      { ...good, path: `${MOD}/../${OTHER}/x.jpg` },
      { ...good, path: `${MOD}/${UP}/a/b.jpg` },
      { ...good, type: "text/html" },
      { ...good, size: FILE_MAX_BYTES + 1 },
      { ...good, size: 0 },
      "sink.jpg",
    ];
    for (const photo of bad) expect(validateSubmission(cfg, { email: "a@b.co", photo }, MOD).ok, JSON.stringify(photo)).toBe(false);
  });
  it("requires required files and can't accept files without a module context", () => {
    expect(validateSubmission(cfg, { email: "a@b.co" }, MOD).ok).toBe(false);
    expect(validateSubmission(cfg, { email: "a@b.co", photo: good }).ok).toBe(false);
  });
});

describe("form style", () => {
  const ws = { color: "#1b2542", font: "modern" as const, radius: 10 };
  it("falls back to the workspace brand", () => {
    expect(resolveBrand(ws, parseFormConfig({}).style)).toEqual(ws);
  });
  it("applies valid overrides and drops invalid ones", () => {
    const style = parseFormConfig({ style: { color: "#0f766e", font: "friendly", radius: 99 } }).style;
    expect(resolveBrand(ws, style)).toEqual({ color: "#0f766e", font: "friendly", radius: 24 });
    const bad = parseFormConfig({ style: { color: "red", font: "comic" } }).style;
    expect(resolveBrand(ws, bad)).toEqual(ws);
  });
});

describe("AI draft cleanup", () => {
  it("maps the model's JSON into a safe config", () => {
    const c = configFromDraft({
      title: "Request a quote",
      intro: "We reply within a day.",
      submit_label: "Send",
      success_message: "Thanks!",
      fields: [
        { id: "name", label: "Your name", type: "text", required: true, options: [] },
        { id: "email", label: "Email", type: "email", required: true, options: [] },
        { id: "service", label: "Service", type: "select", required: true, options: ["Repair", "Install"] },
        { id: "photo", label: "Photo of the problem", type: "file", required: false, options: [] },
      ],
    });
    expect(c.fields.map((f) => f.type)).toEqual(["text", "email", "select", "file"]);
    expect(c.fields[2].options).toEqual(["Repair", "Install"]);
    expect(c.submitLabel).toBe("Send");
  });
  it("adds an email field when the draft forgot one, and drops junk fields", () => {
    const c = configFromDraft({
      title: "x", intro: "", submit_label: "", success_message: "",
      fields: [
        { id: "name", label: "Name", type: "text", required: true, options: [] },
        { id: "Bad Id!", label: "x", type: "text", required: false, options: [] },
        { id: "evil", label: "x", type: "script", required: false, options: [] },
      ],
    });
    expect(c.fields.map((f) => f.id)).toEqual(["name", "email"]);
    expect(c.submitLabel).toBe("Send");
  });
  it("caps drafts at 12 fields", () => {
    const fields = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, label: `Q${i}`, type: "text", required: false, options: [] }));
    fields[0] = { id: "email", label: "Email", type: "email", required: true, options: [] };
    expect(configFromDraft({ title: "", intro: "", submit_label: "", success_message: "", fields }).fields.length).toBe(12);
  });
});
