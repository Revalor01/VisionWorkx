"use client";

import { computeEstimate, formatMoney, type QuoteAnswers, type QuotePricing } from "@/lib/modules/quote";

// Step 1 of a quote calculator module: the priced inputs and a live estimate.
// Rendered inside ModuleForm (which supplies the brand CSS variables and the
// contact step), so it only draws controls. Every control is a native input
// with a visible label, so it works with keyboards and screen readers.

export default function QuoteCalculator(props: {
  pricing: QuotePricing;
  answers: QuoteAnswers;
  onChange: (next: QuoteAnswers) => void;
}) {
  const { pricing, answers, onChange } = props;
  const set = (id: string, v: number | number[]) => onChange({ ...answers, [id]: v });
  const estimate = computeEstimate(pricing, answers);

  return (
    <div className="vwm-q">
      {pricing.inputs.map((i) => {
        const id = `vwm-q-${i.id}`;
        const v = answers[i.id];
        if (i.kind === "slider") {
          const value = typeof v === "number" ? v : i.default;
          return (
            <div key={i.id} className="vwm-q-row">
              <div className="vwm-q-head">
                <label htmlFor={id}>{i.label}</label>
                <output htmlFor={id}>
                  {value.toLocaleString("en-US")}
                  {i.unit ? ` ${i.unit}` : ""}
                </output>
              </div>
              <input
                id={id}
                type="range"
                min={i.min}
                max={i.max}
                step={i.step}
                value={value}
                aria-valuetext={`${value.toLocaleString("en-US")}${i.unit ? ` ${i.unit}` : ""}`}
                onChange={(e) => set(i.id, Number(e.target.value))}
              />
            </div>
          );
        }
        if (i.kind === "counter") {
          const value = typeof v === "number" ? v : i.default;
          return (
            <div key={i.id} className="vwm-q-row vwm-q-inline">
              <span className="vwm-q-label" id={`${id}-l`}>
                {i.label}
              </span>
              <div className="vwm-q-counter" role="group" aria-labelledby={`${id}-l`}>
                <button type="button" aria-label={`Fewer ${i.label.toLowerCase()}`} disabled={value <= i.min} onClick={() => set(i.id, value - 1)}>
                  −
                </button>
                <span aria-live="polite">{value}</span>
                <button type="button" aria-label={`More ${i.label.toLowerCase()}`} disabled={value >= i.max} onClick={() => set(i.id, value + 1)}>
                  +
                </button>
              </div>
            </div>
          );
        }
        if (i.kind === "choice") {
          const value = typeof v === "number" ? v : 0;
          return (
            <fieldset key={i.id} className="vwm-q-row">
              <legend>{i.label}</legend>
              <div className="vwm-q-pills">
                {i.options.map((o, idx) => (
                  <label key={o.label} className={idx === value ? "is-on" : ""}>
                    <input type="radio" name={id} checked={idx === value} onChange={() => set(i.id, idx)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        const picked = Array.isArray(v) ? v : [];
        return (
          <fieldset key={i.id} className="vwm-q-row">
            <legend>{i.label}</legend>
            <div className="vwm-q-checks">
              {i.options.map((o, idx) => {
                const on = picked.includes(idx);
                return (
                  <label key={o.label} className={on ? "is-on" : ""}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => set(i.id, on ? picked.filter((x) => x !== idx) : [...picked, idx].sort((a, b) => a - b))}
                    />
                    <span>{o.label}</span>
                    {o.priceCents > 0 && <em>+{formatMoney(o.priceCents)}</em>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {pricing.frequency && (
        <fieldset className="vwm-q-row">
          <legend>{pricing.frequency.label}</legend>
          <div className="vwm-q-pills">
            {pricing.frequency.options.map((o, idx) => {
              const on = answers.__frequency === idx;
              return (
                <label key={o.label} className={on ? "is-on" : ""}>
                  <input type="radio" name="vwm-q-frequency" checked={on} onChange={() => set("__frequency", idx)} />
                  <span>{o.label}</span>
                  {o.discountPct > 0 && <em>save {o.discountPct}%</em>}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="vwm-q-est" aria-live="polite">
        <span>Estimated{pricing.unitLabel ? ` ${pricing.unitLabel}` : ""}</span>
        <strong>{estimate.text.replace(pricing.unitLabel ? ` ${pricing.unitLabel}` : "", "")}</strong>
      </div>
    </div>
  );
}

export const QUOTE_CSS = `
.vwm-q{display:flex;flex-direction:column;gap:16px}
.vwm-q-row{border:0;margin:0;padding:0;min-width:0}
.vwm-q-row legend,.vwm-q-head label,.vwm-q-label{font-size:14px;font-weight:600;color:#39404f;padding:0;margin-bottom:8px}
.vwm-q-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.vwm-q-head output{font-size:14px;color:#1f2533;font-variant-numeric:tabular-nums}
.vwm-q input[type=range]{width:100%;accent-color:var(--vw-b);min-height:32px}
.vwm-q-inline{display:flex;align-items:center;justify-content:space-between;gap:12px}
.vwm-q-inline .vwm-q-label{margin:0}
.vwm-q-counter{display:flex;align-items:center;gap:10px}
.vwm-q-counter button{width:40px;height:40px;border-radius:calc(var(--vw-r)*.7);border:1px solid #cfd4de;background:#fbfbfd;font:600 18px var(--vw-font);color:#1f2533;cursor:pointer}
.vwm-q-counter button:disabled{opacity:.4;cursor:default}
.vwm-q-counter span{min-width:24px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
.vwm-q-pills,.vwm-q-checks{display:flex;flex-wrap:wrap;gap:8px}
.vwm-q-pills label,.vwm-q-checks label{position:relative;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:8px 12px;border:1px solid #cfd4de;border-radius:calc(var(--vw-r)*.7);background:#fbfbfd;font-size:14px;color:#1f2533;cursor:pointer}
.vwm-q-pills input{position:absolute;opacity:0;width:1px;height:1px}
.vwm-q-checks input{accent-color:var(--vw-b);width:16px;height:16px;margin:0}
.vwm-q-pills label.is-on,.vwm-q-checks label.is-on{border-color:var(--vw-b);background:var(--vw-soft)}
.vwm-q-pills label:focus-within,.vwm-q-checks label:focus-within,.vwm-q-counter button:focus-visible,.vwm-q input[type=range]:focus-visible{outline:2px solid var(--vw-b);outline-offset:2px}
.vwm-q-pills em,.vwm-q-checks em{font-style:normal;font-size:12.5px;color:#5f6778}
.vwm-q-est{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:14px 16px;border-radius:calc(var(--vw-r)*.8);background:var(--vw-soft)}
.vwm-q-est span{font-size:14px;color:#39404f}
.vwm-q-est strong{font-size:22px;color:#141925;font-variant-numeric:tabular-nums}
.vwm-q-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;margin:0 0 14px;border-radius:calc(var(--vw-r)*.8);background:var(--vw-soft);font-size:14px;color:#39404f}
.vwm-q-summary strong{color:#141925}
.vwm-link{background:none;border:0;padding:4px 0;font:600 14px var(--vw-font);color:#39404f;text-decoration:underline;cursor:pointer}
.vwm-link:focus-visible{outline:2px solid var(--vw-b);outline-offset:2px}
`;
