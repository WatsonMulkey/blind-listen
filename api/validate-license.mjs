import { applyCors, polarPost } from './_polar.mjs';

// POST /api/validate-license {key} -> {valid: boolean}
// 200 always (a bad key is a normal answer, not an error); 502 only when
// Polar itself is unreachable so the client can apply its 7-day grace.
//
// Doc-check finding (2026-08-24): Polar documents TWO validate endpoints,
// not one:
//   - POST /v1/customer-portal/license-keys/validate — the brief's original
//     path. Polar's own docs state this endpoint "doesn't require
//     authentication and can be safely used on a public client, like a
//     desktop application or a mobile app. If you plan to validate a license
//     key on a server, use the /v1/license-keys/validate endpoint instead."
//     (github.com/polarsource/polar-js docs/sdks/polarlicensekeys/README.md —
//     the CustomerPortal.LicenseKeys SDK doc)
//   - POST /v1/license-keys/validate — org-scoped, requires the
//     license_keys:write OAT scope (github.com/polarsource/polar-js
//     docs/sdks/licensekeys/README.md).
// This function IS the server — POLAR_ACCESS_TOKEN lives only here, never
// shipped to the browser — so it uses the org-scoped path per Polar's own
// guidance; polarPost() already always sends the Bearer token, so no extra
// wiring was needed. Request body field is organization_id (snake_case,
// confirmed against Polar's own doc prose quoting that literal field name,
// not just the camelCase organizationId shown in the JS SDK wrapper).
//
// RISK NOTE: the exact status codes this org-scoped endpoint returns for an
// invalid/expired/not-found key are not independently confirmed (docs.polar.sh
// interactive API reference pages 404'd for direct fetch during this
// doc-check — see task-6-report.md). The codes below (404/400/403/422) are
// carried over from the brief plus 422 (HTTPValidationError, documented as a
// possible error on the org-scoped licenseKeys.validate SDK method). If live
// sandbox testing (Task 7 Step 6) shows a different invalid-key status code,
// this branch is the one-line fix.
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const key = req.body && req.body.key;
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'missing key' });

  try {
    const r = await polarPost('/v1/license-keys/validate', {
      key,
      organization_id: process.env.POLAR_ORG_ID,
    });
    if (r.ok) return res.status(200).json({ valid: true });
    if (r.status === 404 || r.status === 400 || r.status === 403 || r.status === 422) {
      return res.status(200).json({ valid: false });
    }
    return res.status(502).json({ error: `polar ${r.status}` });
  } catch (e) {
    return res.status(502).json({ error: 'polar unreachable' });
  }
}
