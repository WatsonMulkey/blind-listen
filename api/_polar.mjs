// Shared Polar REST helper for the api/ functions. Zero dependencies — the
// app's zero-dependency claim covers these functions too (bare fetch only).
//
// Extension is .mjs, not .js. This repo has no package.json (hard constraint —
// do not add one), so Node has no "type":"module" declaration that would make
// a bare .js file parse as ESM; .mjs is unambiguous ESM regardless of
// package.json presence. Confirmed against Vercel's current Node.js runtime
// docs (2026-08-24): "To use ES modules in JavaScript, name the file
// `server.mjs` or set `"type": "module"` in `package.json`."
// (vercel.com/docs/functions/runtimes/node-js) — same Node.js module
// resolution rule applies uniformly to /api entrypoints. The Advanced
// Node.js Usage page confirms .mjs is a recognized /api entrypoint extension:
// "The entry point for `src` must be a glob matching `.js`, `.mjs`, or `.ts`
// files that export a default function."
// (vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration)
//
// Underscore-prefixed files are never turned into routes by Vercel — confirmed
// verbatim: "Vercel ignores files with the following characters: Files that
// start with an underscore, `_`..." (vercel.com/docs/functions/configuring-
// functions/advanced-configuration, "Adding utility files to the /api
// directory"). So this file is never itself deployed as a route.

const POLAR_BASE = process.env.POLAR_ENV === 'production'
  ? 'https://api.polar.sh'
  : 'https://sandbox-api.polar.sh';
// Base URLs confirmed verbatim against Polar's docs (2026-08-24):
// "Production Base URL: https://api.polar.sh/v1" /
// "Sandbox Base URL: https://sandbox-api.polar.sh/v1" — the /v1 prefix is
// added per-call below (e.g. polarGet('/v1/checkouts/...')), matching the
// brief's original constant exactly.

export const ALLOWED_ORIGINS = ['https://blind-listen.vercel.app', 'https://foil.engineering'];

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export async function polarGet(path) {
  const r = await fetch(`${POLAR_BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Polar ${path} -> ${r.status}`);
  return r.json();
}

export async function polarPost(path, body) {
  const r = await fetch(`${POLAR_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return r; // callers branch on status
}
