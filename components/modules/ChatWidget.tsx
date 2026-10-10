"use client";

import { useEffect, useRef, useState } from "react";
import type { Brand } from "@/lib/modules/config";

// The visitor-facing AI receptionist chat, rendered inside the embed iframe
// (floating panel or inline). Talks to the parent page only through
// postMessage (resize / close) and to the server only through
// /api/m/<id>/chat. The conversation lives as long as the iframe (closing the
// floating panel only hides it). The owner's "Test it" preview reuses it with `send`.

const FONTS: Record<Brand["font"], string> = {
  modern: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  classic: 'Georgia, "Times New Roman", serif',
  friendly: '"Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
};

function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#141925" : "#ffffff";
}

export type ChatMessage = { role: "visitor" | "assistant"; content: string; note?: string };
export type SendFn = (message: string, history: ChatMessage[]) => Promise<{ reply: string; note?: string | null }>;

const INLINE_HEIGHT = 540;

const CSS = `
.vwc{all:initial;display:flex;flex-direction:column;height:100%;font-family:var(--f);color:#1f2533;background:#fff;box-sizing:border-box}
.vwc *{box-sizing:border-box}
.vwc-card{display:flex;flex-direction:column;height:100%;border:1px solid #e6e9ef;border-radius:var(--r);overflow:hidden;background:#fff}
.vwc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--b);color:var(--k)}
.vwc-head img{width:32px;height:32px;border-radius:50%;object-fit:cover;background:#fff}
.vwc-ini{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.2);font-weight:700}
.vwc-t{flex:1;min-width:0}.vwc-t b{display:block;font-size:15px}.vwc-t span{display:block;font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vwc-x{background:transparent;border:0;color:var(--k);font-size:22px;line-height:1;cursor:pointer;padding:4px 6px}
.vwc-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f7f8fa}
.vwc-m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}
.vwc-a{align-self:flex-start;background:#fff;border:1px solid #e6e9ef}
.vwc-v{align-self:flex-end;background:var(--b);color:var(--k)}
.vwc-note{align-self:center;font-size:12px;color:#8a5a00;background:#fff7e6;border-radius:8px;padding:4px 8px}
.vwc-typing{align-self:flex-start;color:#6a7285;font-size:13px;padding:4px 2px}
.vwc-form{display:flex;gap:8px;padding:10px;border-top:1px solid #eceef3;background:#fff}
.vwc-form input{flex:1;font:14px var(--f);color:#1f2533;background:#fbfbfd;border:1px solid #d9dde6;border-radius:calc(var(--r)*.8);padding:10px 12px;min-width:0}
.vwc-form input:focus{outline:none;border-color:var(--b);box-shadow:0 0 0 3px var(--s)}
.vwc-form button{background:var(--b);color:var(--k);border:0;border-radius:calc(var(--r)*.8);padding:0 14px;font:600 14px var(--f);cursor:pointer}
.vwc-form button:disabled{opacity:.5;cursor:default}
.vwc-err{color:#b42318;font-size:12px;padding:0 12px 8px}
.vwc-ft{font-size:11px;color:#8a91a1;text-align:center;padding:0 0 8px}
.vwc-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
`;

export default function ChatWidget(props: {
  publicId: string;
  businessName: string;
  logoUrl: string | null;
  brand: Brand;
  title: string;
  intro: string;
  greeting: string;
  sourceUrl: string | null;
  /** Rendered in the floating panel (shows a close button, fills the frame). */
  panel?: boolean;
  /** Owner preview: replaces the network call. */
  send?: SendFn;
}) {
  const { publicId, brand } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conv = useRef<{ conversationId: string; token: string } | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  // Inline embeds get a fixed height; the floating panel is sized by embed.js.
  useEffect(() => {
    if (props.panel || props.send || window.parent === window) return;
    window.parent.postMessage({ type: "vw:resize", id: publicId, height: INLINE_HEIGHT }, "*");
  }, [publicId, props.panel, props.send]);

  async function networkSend(message: string): Promise<{ reply: string; note?: string | null }> {
    const res = await fetch(`/api/m/${publicId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(conv.current ?? {}), message, source_url: props.sourceUrl, vw_hp: hp }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404 && body.code === "expired") {
      conv.current = null; // start fresh next time
    }
    if (!res.ok) throw new Error(body.error || "Something went wrong — please try again.");
    if (body.conversationId && body.token) conv.current = { conversationId: body.conversationId, token: body.token };
    return { reply: body.reply };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    setError("");
    setDraft("");
    const history = messages;
    setMessages((m) => [...m, { role: "visitor", content: message }]);
    setBusy(true);
    try {
      const r = props.send ? await props.send(message, history) : await networkSend(message);
      setMessages((m) => [...m, { role: "assistant", content: r.reply, ...(r.note ? { note: r.note } : {}) }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      setMessages((m) => m.slice(0, -1));
      setDraft(message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const color = /^#[0-9a-fA-F]{6}$/.test(brand.color) ? brand.color : "#1b2542";
  const vars = {
    "--b": color,
    "--k": inkFor(color),
    "--s": `${color}1f`,
    "--r": `${brand.radius}px`,
    "--f": FONTS[brand.font],
    height: props.panel ? "100vh" : props.send ? 480 : INLINE_HEIGHT,
  } as React.CSSProperties;
  const initials = props.businessName.trim().charAt(0).toUpperCase();

  return (
    <div ref={rootRef} className="vwc" style={vars}>
      <style>{CSS}</style>
      <div className="vwc-card">
        <header className="vwc-head">
          {props.logoUrl && /^https:\/\//.test(props.logoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logoUrl} alt={`${props.businessName} logo`} />
          ) : (
            <span className="vwc-ini" aria-hidden="true">{initials || "•"}</span>
          )}
          <div className="vwc-t">
            <b>{props.title || props.businessName}</b>
            {props.intro && <span>{props.intro}</span>}
          </div>
          {props.panel && (
            <button type="button" className="vwc-x" aria-label="Close chat" onClick={() => window.parent.postMessage({ type: "vw:chat-close", id: publicId }, "*")}>
              ×
            </button>
          )}
        </header>
        <div ref={logRef} className="vwc-log" role="log" aria-live="polite" aria-label="Conversation">
          <div className="vwc-m vwc-a">{props.greeting}</div>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div className={`vwc-m ${m.role === "visitor" ? "vwc-v" : "vwc-a"}`}>{m.content}</div>
              {m.note && <div className="vwc-note">{m.note}</div>}
            </div>
          ))}
          {busy && <div className="vwc-typing">Typing…</div>}
        </div>
        {error && (
          <p className="vwc-err" role="alert">
            {error}
          </p>
        )}
        <form className="vwc-form" onSubmit={submit}>
          <label className="vwc-hp" aria-hidden="true">
            Leave empty
            <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
          </label>
          <input
            ref={inputRef}
            aria-label="Your message"
            placeholder="Type your message…"
            maxLength={1000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
        <div className="vwc-ft">AI assistant · Powered by VisionWorkx</div>
      </div>
    </div>
  );
}
