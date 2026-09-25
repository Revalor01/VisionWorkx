import { EMBED_ORIGIN } from "./constants";

export function embedSnippet(publicId: string, origin = EMBED_ORIGIN): string {
  return `<script src="${origin}/embed.js" data-module="${publicId}" async></script>`;
}

// Plain-English install steps per site builder. `autoHeight: false` means the
// builder wraps custom code in its own fixed-size box, so the owner sets a height.
export const INSTALL_STEPS: { builder: string; steps: string[]; note?: string }[] = [
  {
    builder: "WordPress",
    steps: [
      "Open the page in the WordPress editor.",
      "Click + and add a “Custom HTML” block where the form should appear.",
      "Paste the snippet into the block, then click Update.",
    ],
    note: "Use the Custom HTML block — some security plugins strip scripts pasted into other blocks.",
  },
  {
    builder: "Squarespace",
    steps: [
      "Edit the page and click an insert point (+).",
      "Choose “Code”, paste the snippet, and turn off “Display Source”.",
      "Click Apply, then Save.",
    ],
    note: "Squarespace only runs scripts in Code Blocks on plans that allow JavaScript.",
  },
  {
    builder: "Wix",
    steps: [
      "Click Add Elements → Embed Code → Embed HTML.",
      "Click Enter Code, choose “Code”, paste the snippet, and click Update.",
      "Drag the box to make it tall enough for the form (about 650px), then Publish.",
    ],
    note: "Wix puts custom code in its own box, so set the height yourself.",
  },
  {
    builder: "Webflow",
    steps: [
      "In the Designer, open Add (+) and drag a “Code Embed” element onto the page.",
      "Paste the snippet and click Save & Close.",
      "Publish the site.",
    ],
    note: "Custom code needs a paid Webflow site plan.",
  },
  {
    builder: "Framer",
    steps: [
      "Click Insert → Utility → Embed and place it on the page.",
      "In the right panel choose “HTML” and paste the snippet.",
      "Set the embed's height to fit the form (about 650px), then Publish.",
    ],
    note: "Framer puts embeds in their own box, so set the height yourself.",
  },
  {
    builder: "Shopify",
    steps: [
      "Go to Online Store → Themes → Customize.",
      "Open the page, click Add section → “Custom Liquid”.",
      "Paste the snippet and click Save.",
    ],
  },
];
