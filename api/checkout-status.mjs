import { applyCors, polarGet } from './_polar.mjs';

// GET /api/checkout-status?id=<checkoutId>
// -> {status, product: 'extend'|'pro'|null, licenseKey: string|null}
// licenseKey is best-effort: if the grants lookup fails, the buyer still has
// the key via Polar's email + the app's manual "Enter license key" input.
//
// Doc-check finding (2026-08-24): Polar's CheckoutStatus enum has FIVE
// values — open | expired | confirmed | succeeded | failed — not the three
// named in this function's response contract. Confirmed via
// github.com/polarsource/polar-js docs/models/components/checkoutstatus.md
// ("open" | "expired" | "confirmed" | "succeeded" | "failed") and
// corroborated by web search of Polar's docs (confirmed/failed are real
// checkout lifecycle states: confirmed = "user clicked Pay, not indicative
// of payment success"; failed = "definitely failed for technical reasons").
// mapCheckoutStatus() normalizes to the three-value contract so callers
// (Task 7's client) never see a status outside {succeeded, open, expired} —
// the RESPONSE CONTRACT itself is unchanged, this only guards it.
function mapCheckoutStatus(status) {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'expired' || status === 'failed') return 'expired';
  return 'open'; // 'open', 'confirmed', or any unrecognized future value
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });

  const id = req.query.id;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'missing id' });

  try {
    // Path confirmed unchanged from the brief: GET /v1/checkouts/{id}.
    // product_id / customer_id field names confirmed snake_case (Polar's
    // REST API is snake_case; the polar-js SDK's camelCase productId/
    // customerId are that SDK's own wrapper convention, not the wire shape —
    // confirmed against organization_id's snake_case in the license-key
    // validate request docs, same API).
    const checkout = await polarGet(`/v1/checkouts/${encodeURIComponent(id)}`);
    const product =
      checkout.product_id === process.env.POLAR_PRODUCT_EXTEND_ID ? 'extend' :
      checkout.product_id === process.env.POLAR_PRODUCT_PRO_ID ? 'pro' : null;

    const status = mapCheckoutStatus(checkout.status);

    let licenseKey = null;
    if (status === 'succeeded' && product === 'pro' && checkout.customer_id) {
      try {
        // License keys are granted per-customer via the product's benefit.
        // /v1/license-keys list endpoint confirmed to exist with filters
        // organization_id, benefit_id, status, page, limit (polar-python SDK
        // docs). customer_id as a list filter is UNCONFIRMED — it did not
        // appear in that filter list, but this call is already best-effort
        // (wrapped below, licenseKey stays null on any failure — manual
        // "Enter license key" entry covers the gap), so an unsupported or
        // ignored filter degrades safely rather than breaking the response.
        // Flagged for confirmation at live sandbox verification.
        const keys = await polarGet(
          `/v1/license-keys?organization_id=${process.env.POLAR_ORG_ID}&customer_id=${encodeURIComponent(checkout.customer_id)}&limit=1`
        );
        licenseKey = keys.items && keys.items[0] ? keys.items[0].key : null;
      } catch (e) { /* best-effort — manual entry covers this */ }
    }

    return res.status(200).json({ status, product, licenseKey });
  } catch (e) {
    return res.status(502).json({ error: 'polar unreachable' });
  }
}
