#!/usr/bin/env node
// ADR-033 / FOI-651: CI-only headless runner for test-runner.html.
//
// The shipped app is zero-dependency (no package.json, no build step) and this
// script keeps that true: it uses only node built-ins at runtime, plus
// Playwright which CI installs ad hoc (`npm install --no-save playwright@<pin>`)
// and which is never required to USE the app or to run the tests manually in a
// browser (the day-one path: just open test-runner.html).
//
// What it does:
//   1. serves the repo directory over a local HTTP server (node http built-in),
//   2. opens test-runner.html in headless Chromium,
//   3. waits for the harness's completion signal — the harness logs
//      "Test run complete: N passed, N failed, N total" to the console when
//      runAllTests() finishes,
//   4. cross-checks the DOM counters (#passCount / #failCount / #totalLabel)
//      against the console summary and detects the day-one Web Audio SKIP
//      guard (one SKIP note row = the whole LUFS suite, MV-001..006, skipped),
//   5. prints one parseable summary line:
//        HARNESS SUMMARY: passed=N failed=N total=N skipped_markers=N webaudio=yes|no
//   6. applies the EXPECTED_MIN floor (same semantics as The Number's
//      scripts/ci_floor_gate.py): a green exit code only proves the tests that
//      RAN passed; the floor proves the suite didn't rot silently.
//
// Exits nonzero on: any test failure, floor breach, missing summary (suite
// never completed), page error, or timeout. Failing tests are printed
// verbatim (id, name, assertion message) from the harness's own DOM output.
//
// Local use (from repo root):
//   npm install --no-save --no-package-lock playwright@1.61.1
//   npx playwright install chromium
//   node scripts/ci-run-tests.mjs                 # report only (no floor)
//   EXPECTED_MIN=105 node scripts/ci-run-tests.mjs  # with the floor gate

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = Number(process.env.CI_HARNESS_TIMEOUT_MS || 120_000);
const EXPECTED_MIN = process.env.EXPECTED_MIN ? Number(process.env.EXPECTED_MIN) : null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const filePath = path.join(REPO_ROOT, urlPath === "/" ? "index.html" : urlPath);
      // Refuse anything that escapes the repo root.
      if (!filePath.startsWith(REPO_ROOT)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      "ERROR: playwright is not installed. This is a CI-only dependency — install it ad hoc:\n" +
        "  npm install --no-save --no-package-lock playwright@1.61.1\n" +
        "  npx playwright install chromium"
    );
    return 2;
  }

  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/test-runner.html`;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const SUMMARY_RE = /^Test run complete: (\d+) passed, (\d+) failed, (\d+) total$/;
  let consoleSummary = null;
  const failLines = [];
  const pageErrors = [];
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));

  page.on("console", (msg) => {
    const text = msg.text();
    // The harness console.error()s each failure as "[FAIL] <id> — <name>".
    if (text.startsWith("[FAIL]")) failLines.push(text);
    const m = SUMMARY_RE.exec(text);
    if (m) {
      consoleSummary = { passed: +m[1], failed: +m[2], total: +m[3] };
      resolveDone();
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(String(err));
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });

  const timedOut = await Promise.race([
    done.then(() => false),
    new Promise((r) => setTimeout(r, TIMEOUT_MS, true)),
  ]);

  let exitCode = 0;

  if (timedOut || !consoleSummary) {
    console.error(
      `ERROR: harness did not print its completion line within ${TIMEOUT_MS}ms — ` +
        "the suite may have thrown before finishing. Treating as failure."
    );
    if (pageErrors.length) {
      console.error("Uncaught page errors:");
      for (const e of pageErrors) console.error(`  ${e}`);
    }
    await browser.close();
    server.close();
    return 1;
  }

  // Cross-check the DOM counters and collect skip/fail detail.
  const dom = await page.evaluate(() => {
    const skipRows = [...document.querySelectorAll(".test-name")]
      .filter((el) => el.textContent.includes("skipped"))
      .map((el) => el.textContent.trim());
    const failures = [...document.querySelectorAll(".test-row.fail")].map((row) => ({
      id: row.querySelector(".test-id")?.textContent.trim() ?? "?",
      name: row.querySelector(".test-name")?.textContent.trim() ?? "?",
      error: row.querySelector(".test-error")?.textContent.trim() ?? "",
    }));
    return {
      passCount: Number(document.getElementById("passCount").textContent),
      failCount: Number(document.getElementById("failCount").textContent),
      totalLabel: document.getElementById("totalLabel").textContent.trim(),
      webAudioAvailable:
        typeof AudioContext !== "undefined" || typeof webkitAudioContext !== "undefined",
      skipRows,
      failures,
    };
  });

  await browser.close();
  server.close();

  const { passed, failed, total } = consoleSummary;

  if (dom.passCount !== passed || dom.failCount !== failed) {
    console.error(
      `ERROR: DOM counters (${dom.passCount} passed, ${dom.failCount} failed) disagree with the ` +
        `console summary (${passed} passed, ${failed} failed) — harness output changed shape; ` +
        "update this runner deliberately."
    );
    exitCode = 1;
  }

  // The one parseable line. skipped_markers counts SKIP note rows, not tests:
  // the harness skips at suite granularity (one row = the 6-test LUFS suite).
  console.log(
    `HARNESS SUMMARY: passed=${passed} failed=${failed} total=${total} ` +
      `skipped_markers=${dom.skipRows.length} webaudio=${dom.webAudioAvailable ? "yes" : "no"}`
  );
  for (const s of dom.skipRows) console.log(`  SKIP: ${s}`);

  if (failed > 0) {
    console.error(`\n${failed} test(s) FAILED:`);
    for (const f of dom.failures) {
      console.error(`  [FAIL] ${f.id} — ${f.name}`);
      if (f.error) console.error(`         ${f.error}`);
    }
    exitCode = 1;
  }

  if (pageErrors.length) {
    console.error("\nUncaught page errors during the run:");
    for (const e of pageErrors) console.error(`  ${e}`);
    exitCode = 1;
  }

  // Floor gate — same semantics as The Number's ci_floor_gate.py (FOI-598):
  // catches silent collection rot, not just red tests.
  if (EXPECTED_MIN !== null) {
    if (!Number.isFinite(EXPECTED_MIN)) {
      console.error(`FLOOR GATE: EXPECTED_MIN=${process.env.EXPECTED_MIN} is not a number.`);
      exitCode = 1;
    } else if (passed < EXPECTED_MIN) {
      console.error(
        `FLOOR GATE: ${passed} passed < floor ${EXPECTED_MIN} — the suite shrank or partially ` +
          "failed to run. Raise the floor only via a reviewed change; never lower it without a ticket."
      );
      exitCode = 1;
    } else {
      console.log(`FLOOR GATE OK: ${passed} passed >= floor ${EXPECTED_MIN}`);
    }
  } else {
    console.log("FLOOR GATE SKIPPED: EXPECTED_MIN not set (local report-only mode).");
  }

  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("ERROR: runner crashed:", err);
    process.exit(2);
  }
);
