"use client";

import { useEffect, useRef, useState } from "react";
import type { Brand, FormConfig } from "@/lib/modules/config";

// The visitor-facing form rendered inside the embed iframe. Talks to the
// parent page only through postMessage (height + optional redirect), and to
// the server only through /api/m/<id>/submit.

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

export default function ModuleForm(props: {
  publicId: string;
  businessName: string;
  logoUrl: string | null;
  brand: Brand;
  config: FormConfig;
  sourceUrl: string | null;
  preview?: boolean;
}) {
  const { publicId, businessName, logoUrl, brand, config } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Tell the embed loader how tall we are, whenever that changes.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || window.parent === window) return;
    const post = () =>
      window.parent.postMessage({ type: "vw:resize", id: publicId, height: Math.ceil(el.getBoundingClientRect().height) }, "*");
    post();
    const ro = new ResizeObserver(post);
    ro.observe(el);
    return () => ro.disconnect();
  }, [publicId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (props.preview) {
      setStatus("done");
      setMessage(config.successMessage);
      return;
    }
    setStatus("sending");
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    config.fields.forEach((f) => (data[f.id] = String(fd.get(f.id) ?? "")));
    try {
      const res = await fetch(`/api/m/${publicId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, source_url: props.sourceUrl, vw_hp: String(fd.get("vw_hp") ?? "") }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFieldErrors(body.fields ?? {});
        throw new Error(body.error || "Something went wrong — please try again.");
      }
      if (body.redirectUrl && window.parent !== window) {
        window.parent.postMessage({ type: "vw:redirect", id: publicId, url: body.redirectUrl }, "*");
      }
      setStatus("done");
      setMessage(body.message || config.successMessage);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong — please try again.");
    }
  }

  const ink = inkFor(brand.color);
  const r = brand.radius;
  const vars = {
    "--vw-b": brand.color,
    "--vw-ink": ink,
    "--vw-soft": `${brand.color}1f`,
    "--vw-r": `${r}px`,
    "--vw-font": FONTS[brand.font],
  } as React.CSSProperties;
  const initials = businessName
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div ref={rootRef} className="vwm" style={vars}>
      <style>{CSS}</style>
      <div className="vwm-card">
        <header className="vwm-head">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="vwm-logo" src={logoUrl} alt={`${businessName} logo`} />
          ) : (
            <span className="vwm-initials" aria-hidden="true">{initials || "•"}</span>
          )}
          <div>
            <strong>{businessName}</strong>
            {config.title && <span>{config.title}</span>}
          </div>
        </header>
        <div className="vwm-body">
          {status === "done" ? (
            <div className="vwm-done" role="status">
              <div className="vwm-tick" aria-hidden="true">✓</div>
              <p>{message}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate={false}>
              {config.intro && <p className="vwm-intro">{config.intro}</p>}
              <div className="vwm-grid">
                {config.fields.map((f) => {
                  const err = fieldErrors[f.id];
                  const id = `vwm-${f.id}`;
                  const common = {
                    id,
                    name: f.id,
                    required: f.required,
                    maxLength: f.maxLength,
                    placeholder: f.placeholder,
                    "aria-invalid": err ? true : undefined,
                    "aria-describedby": err ? `${id}-err` : undefined,
                  };
                  return (
                    <div key={f.id} className={`vwm-field${f.type === "textarea" ? " vwm-full" : ""}`}>
                      <label htmlFor={id}>
                        {f.label}
                        {f.required ? <span aria-hidden="true"> *</span> : <em> (optional)</em>}
                      </label>
                      {f.type === "textarea" ? (
                        <textarea {...common} rows={4} />
                      ) : f.type === "select" ? (
                        <select {...common} defaultValue="">
                          <option value="" disabled>
                            Choose…
                          </option>
                          {(f.options ?? []).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...common}
                          type={f.type === "phone" ? "tel" : f.type}
                          autoComplete={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.id === "name" ? "name" : "on"}
                        />
                      )}
                      {err && (
                        <span className="vwm-err" id={`${id}-err`}>
                          {err}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="vwm-hp" aria-hidden="true">
                <label>
                  Leave this empty
                  <input name="vw_hp" tabIndex={-1} autoComplete="off" defaultValue="" />
                </label>
              </div>
              <button type="submit" className="vwm-btn" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : config.submitLabel}
              </button>
              {status === "error" && (
                <p className="vwm-error" role="alert">
                  {message}
                </p>
              )}
            </form>
          )}
        </div>
        <footer className="vwm-foot">Powered by VisionWorkx</footer>
      </div>
    </div>
  );
}

const CSS = `
html,body{background:transparent!important;margin:0}
.vwm{font-family:var(--vw-font);color:#1f2533;padding:2px}
.vwm *{box-sizing:border-box}
.vwm-card{background:#fff;border-radius:var(--vw-r);border:1px solid #e6e9ef;overflow:hidden}
.vwm-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #eceef3}
.vwm-head strong{display:block;font-size:16px;color:#141925;line-height:1.25}
.vwm-head span{font-size:13px;color:#6a7285}
.vwm-logo{width:40px;height:40px;object-fit:contain}
.vwm-initials{width:40px;height:40px;border-radius:calc(var(--vw-r)*.8);display:grid;place-items:center;background:var(--vw-b);color:var(--vw-ink);font-weight:700;font-size:15px;flex:none}
.vwm-body{padding:20px}
.vwm-intro{margin:0 0 14px;color:#4b5364;font-size:14.5px;line-height:1.5}
.vwm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
.vwm-field{display:flex;flex-direction:column;gap:5px}
.vwm-full{grid-column:1/-1}
@media (max-width:480px){.vwm-grid{grid-template-columns:1fr}}
.vwm-field label{font-size:13px;font-weight:600;color:#39404f}
.vwm-field label em{font-weight:400;font-style:normal;color:#8a92a4}
.vwm-field input,.vwm-field select,.vwm-field textarea{font:15px var(--vw-font);color:#1f2533;background:#fbfbfd;border:1px solid #d9dde6;border-radius:calc(var(--vw-r)*.7);padding:10px 12px;width:100%}
.vwm-field textarea{resize:vertical}
.vwm-field input:focus,.vwm-field select:focus,.vwm-field textarea:focus{outline:none;border-color:var(--vw-b);box-shadow:0 0 0 3px var(--vw-soft)}
.vwm-field [aria-invalid="true"]{border-color:#d64545}
.vwm-err{font-size:12.5px;color:#c23a3a}
.vwm-btn{margin-top:16px;width:100%;background:var(--vw-b);color:var(--vw-ink);border:0;border-radius:calc(var(--vw-r)*.8);padding:12px 18px;font:600 15px var(--vw-font);cursor:pointer}
.vwm-btn:focus-visible{outline:2px solid var(--vw-b);outline-offset:2px}
.vwm-btn:disabled{opacity:.7;cursor:progress}
.vwm-error{color:#c23a3a;font-size:14px;margin:10px 0 0}
.vwm-done{text-align:center;padding:18px 6px}
.vwm-done p{margin:0;color:#39404f;font-size:15px;line-height:1.5}
.vwm-tick{width:48px;height:48px;border-radius:50%;margin:0 auto 12px;display:grid;place-items:center;background:var(--vw-soft);color:var(--vw-b);font-size:22px;font-weight:700}
.vwm-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.vwm-foot{padding:9px 20px;background:#f8f9fb;border-top:1px solid #eceef3;font-size:11.5px;color:#8a92a4;text-align:right}
@media (prefers-reduced-motion:reduce){.vwm *{transition:none!important}}
`;
