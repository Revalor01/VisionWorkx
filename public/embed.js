/*!
 * VisionWorkx embed loader v1
 * <script src="https://modules.revalorllc.com/embed.js" data-module="m_…" async></script>
 *
 * Renders a VisionWorkx module where the script tag sits (or into the element
 * matched by data-target). Default mode is an iframe (style-safe: the host
 * page's CSS can't break the module and vice versa) that sizes itself to its
 * content. data-mode="shadow" renders the form into a Shadow DOM instead.
 *
 * Written to never break the host page: no globals besides window.VisionWorkx,
 * no dependencies, everything wrapped in try/catch, idempotent if pasted twice.
 */
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.VisionWorkx && window.VisionWorkx.version) {
    try { window.VisionWorkx.load(); } catch (e) {}
    return;
  }

  var ID_RE = /^m_[0-9a-f]{18}$/;
  var frames = {}; // publicId -> [{ el, origin }]
  var listening = false;

  function log(msg) {
    try { if (window.console && console.warn) console.warn("[VisionWorkx] " + msg); } catch (e) {}
  }

  function originOf(script) {
    try { return new URL(script.src, location.href).origin; } catch (e) { return null; }
  }

  function containerFor(script) {
    var sel = script.getAttribute("data-target");
    if (sel) {
      try {
        var t = document.querySelector(sel);
        if (t) return t;
        log("data-target not found: " + sel);
      } catch (e) { log("invalid data-target: " + sel); }
    }
    var div = document.createElement("div");
    div.className = "visionworkx-module";
    if (script.parentNode) script.parentNode.insertBefore(div, script.nextSibling);
    else document.body.appendChild(div);
    return div;
  }

  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener("message", function (e) {
      try {
        var d = e.data;
        if (!d || typeof d !== "object" || typeof d.id !== "string" || !frames[d.id]) return;
        var list = frames[d.id];
        for (var i = 0; i < list.length; i++) {
          var f = list[i];
          if (e.origin !== f.origin || e.source !== f.el.contentWindow) continue;
          if (d.type === "vw:resize" && typeof d.height === "number") {
            f.el.style.height = Math.max(80, Math.min(4000, Math.round(d.height))) + "px";
          } else if (d.type === "vw:redirect" && typeof d.url === "string" && /^https:\/\//.test(d.url)) {
            window.location.assign(d.url);
          }
        }
      } catch (err) {}
    });
  }

  function mountIframe(script, id, origin) {
    var box = containerFor(script);
    var iframe = document.createElement("iframe");
    iframe.src = origin + "/m/" + id + "?src=" + encodeURIComponent(location.href.slice(0, 480));
    iframe.title = script.getAttribute("data-title") || "Contact form";
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("scrolling", "no");
    iframe.style.cssText = "display:block;width:100%;max-width:100%;height:480px;border:0;background:transparent;overflow:hidden;color-scheme:normal";
    box.appendChild(iframe);
    (frames[id] = frames[id] || []).push({ el: iframe, origin: origin });
    listen();
  }

  /* ---------- shadow DOM mode ---------- */
  var SHADOW_CSS =
    ":host{all:initial;display:block}" +
    ".c{font-family:var(--f);color:#1f2533;background:#fff;border:1px solid #e6e9ef;border-radius:var(--r);overflow:hidden}" +
    ".c *{box-sizing:border-box}" +
    ".h{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #eceef3}" +
    ".h b{display:block;font-size:16px;color:#141925}.h span{font-size:13px;color:#6a7285}" +
    ".h img{width:40px;height:40px;object-fit:contain}" +
    ".i{width:40px;height:40px;border-radius:calc(var(--r)*.8);display:grid;place-items:center;background:var(--b);color:var(--k);font-weight:700}" +
    "form,.d{padding:20px;display:grid;gap:12px}" +
    "label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#39404f}" +
    "input,select,textarea{font:15px var(--f);color:#1f2533;background:#fbfbfd;border:1px solid #d9dde6;border-radius:calc(var(--r)*.7);padding:10px 12px;width:100%}" +
    "input:focus,select:focus,textarea:focus{outline:none;border-color:var(--b);box-shadow:0 0 0 3px var(--s)}" +
    "button{background:var(--b);color:var(--k);border:0;border-radius:calc(var(--r)*.8);padding:12px 18px;font:600 15px var(--f);cursor:pointer}" +
    ".e{color:#c23a3a;font-size:13px;margin:0}.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}" +
    ".d{text-align:center;color:#39404f}.ft{padding:9px 20px;background:#f8f9fb;border-top:1px solid #eceef3;font-size:11.5px;color:#8a92a4;text-align:right}";
  var FONTS = {
    modern: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    classic: 'Georgia,"Times New Roman",serif',
    friendly: '"Nunito",ui-rounded,system-ui,sans-serif'
  };

  function ink(hex) {
    try {
      var n = parseInt(hex.slice(1), 16);
      var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
        v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.45 ? "#141925" : "#ffffff";
    } catch (e) { return "#ffffff"; }
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function mountShadow(script, id, origin) {
    var box = containerFor(script);
    if (!box.attachShadow) return mountIframe(script, id, origin); // very old browsers
    fetch(origin + "/api/m/" + id + "/config", { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("config " + r.status); return r.json(); })
      .then(function (m) {
        var root = box.attachShadow({ mode: "open" });
        var brand = m.brand || {};
        var color = /^#[0-9a-fA-F]{6}$/.test(brand.color) ? brand.color : "#1b2542";
        var style = el("style"); style.textContent = SHADOW_CSS; root.appendChild(style);
        var card = el("div", { "class": "c" });
        card.style.cssText = "--b:" + color + ";--k:" + ink(color) + ";--s:" + color + "1f;--r:" +
          (typeof brand.radius === "number" ? brand.radius : 10) + "px;--f:" + (FONTS[brand.font] || FONTS.modern);
        var head = el("div", { "class": "h" });
        if (m.logoUrl && /^https:\/\//.test(m.logoUrl)) head.appendChild(el("img", { src: m.logoUrl, alt: m.name + " logo" }));
        else head.appendChild(el("span", { "class": "i", "aria-hidden": "true" }, (m.name || "•").charAt(0).toUpperCase()));
        var t = el("div"); t.appendChild(el("b", null, m.name || "")); if (m.config.title) t.appendChild(el("span", null, m.config.title));
        head.appendChild(t); card.appendChild(head);

        var form = el("form");
        if (m.config.intro) form.appendChild(el("p", { style: "margin:0;color:#4b5364" }, m.config.intro));
        (m.config.fields || []).forEach(function (f) {
          var label = el("label", null, f.label + (f.required ? " *" : " (optional)"));
          var input;
          if (f.type === "textarea") input = el("textarea", { rows: "4" });
          else if (f.type === "select") {
            input = el("select");
            input.appendChild(el("option", { value: "", disabled: "", selected: "" }, "Choose…"));
            (f.options || []).forEach(function (o) { input.appendChild(el("option", null, o)); });
          } else input = el("input", { type: f.type === "phone" ? "tel" : f.type });
          input.name = f.id; if (f.required) input.required = true; if (f.maxLength) input.maxLength = f.maxLength;
          label.appendChild(input); form.appendChild(label);
        });
        var hp = el("label", { "class": "hp", "aria-hidden": "true" }, "Leave empty");
        hp.appendChild(el("input", { name: "vw_hp", tabindex: "-1", autocomplete: "off" })); form.appendChild(hp);
        var btn = el("button", { type: "submit" }, m.config.submitLabel || "Send"); form.appendChild(btn);
        var err = el("p", { "class": "e", role: "alert" }); form.appendChild(err);
        form.addEventListener("submit", function (ev) {
          ev.preventDefault(); btn.disabled = true; err.textContent = "";
          var data = {}; (m.config.fields || []).forEach(function (f) { data[f.id] = form.elements[f.id].value; });
          fetch(origin + "/api/m/" + id + "/submit", {
            method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: data, source_url: location.href.slice(0, 480), vw_hp: form.elements.vw_hp.value })
          }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
            .then(function (res) {
              btn.disabled = false;
              if (!res.ok) { err.textContent = (res.b && res.b.error) || "Something went wrong — please try again."; return; }
              if (res.b.redirectUrl && /^https:\/\//.test(res.b.redirectUrl)) { window.location.assign(res.b.redirectUrl); return; }
              var done = el("div", { "class": "d", role: "status" }, res.b.message || m.config.successMessage);
              card.replaceChild(done, form);
            })
            .catch(function () { btn.disabled = false; err.textContent = "Something went wrong — please try again."; });
        });
        card.appendChild(form);
        card.appendChild(el("div", { "class": "ft" }, "Powered by VisionWorkx"));
        root.appendChild(card);
      })
      .catch(function (e) { log("couldn't load module " + id + " (" + (e && e.message) + ")"); });
  }

  function load() {
    var scripts = document.querySelectorAll("script[data-module]");
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i];
      try {
        if (s.getAttribute("data-vw-done")) continue;
        s.setAttribute("data-vw-done", "1");
        var id = s.getAttribute("data-module") || "";
        if (!ID_RE.test(id)) { log("invalid data-module: " + id); continue; }
        var origin = originOf(s);
        if (!origin) continue;
        if (s.getAttribute("data-mode") === "shadow") mountShadow(s, id, origin);
        else mountIframe(s, id, origin);
      } catch (e) { log("embed failed: " + (e && e.message)); }
    }
  }

  window.VisionWorkx = { version: "1", load: load };
  try {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
    else load();
  } catch (e) {}
})();
