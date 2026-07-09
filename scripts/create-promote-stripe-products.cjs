// One-off script: creates the VisionWorkx Promote Stripe products + prices
// and prints the resulting price IDs to add to .env.local. Safe to re-run —
// it skips creation if a product with the same name already exists.
//
// Usage: node scripts/create-promote-stripe-products.cjs

const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

loadEnvLocal();

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = [
  { key: "STARTER", name: "VisionWorkx Promote — Starter", amount: 1900 },
  { key: "GROWTH", name: "VisionWorkx Promote — Growth", amount: 4900 },
  { key: "PRO", name: "VisionWorkx Promote — Pro", amount: 9900 },
];

async function main() {
  const results = {};

  for (const plan of PLANS) {
    const existingProducts = await stripe.products.search({
      query: `name:'${plan.name}'`,
    });

    let product = existingProducts.data[0];
    if (!product) {
      product = await stripe.products.create({ name: plan.name });
      console.log(`Created product: ${plan.name} (${product.id})`);
    } else {
      console.log(`Found existing product: ${plan.name} (${product.id})`);
    }

    const existingPrices = await stripe.prices.list({ product: product.id, active: true });
    let price = existingPrices.data.find(
      (p) => p.unit_amount === plan.amount && p.recurring?.interval === "month"
    );

    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.amount,
        currency: "usd",
        recurring: { interval: "month" },
      });
      console.log(`Created price for ${plan.name}: ${price.id}`);
    } else {
      console.log(`Found existing price for ${plan.name}: ${price.id}`);
    }

    results[plan.key] = price.id;
  }

  console.log("\nAdd these to .env.local:\n");
  console.log(`STRIPE_PROMOTE_STARTER_PRICE_ID=${results.STARTER}`);
  console.log(`STRIPE_PROMOTE_GROWTH_PRICE_ID=${results.GROWTH}`);
  console.log(`STRIPE_PROMOTE_PRO_PRICE_ID=${results.PRO}`);
  console.log(`\nAlso set STRIPE_PROMOTE_WEBHOOK_SECRET after registering the webhook endpoint in the Stripe Dashboard (Developers -> Webhooks -> Add endpoint -> https://<your-domain>/api/webhooks/stripe-promote).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
