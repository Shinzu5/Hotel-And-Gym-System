// Seed helper for the test suites.
//
// The application is seeded BRAND NEW (admin + membership tiers + the four
// apartments) and the demo data lives behind `npm run seed:demo`. The tests
// need a known state, so they seed the demo data up front and put the app
// back to brand new when they finish.

const { spawnSync } = require("child_process");
const path = require("path");

const BACKEND = path.join(__dirname, "..");

/**
 * Run the seed in a mode.
 *   seed("demo")  -> the full demo data
 *   seed("empty") -> brand new (no sample records)
 */
function seed(mode = "empty") {
  const args = ["prisma/seed.js"];
  if (mode === "empty") args.push("--empty");

  const result = spawnSync("node", args, {
    cwd: BACKEND,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    console.error(`seed (${mode}) failed:\n${result.stdout || ""}\n${result.stderr || ""}`);
    process.exit(1);
  }
  return result.stdout || "";
}

const seedDemo = () => seed("demo");
const seedEmpty = () => seed("empty");

/**
 * fetch with one retry.
 *
 * A long seed (or a long pause) can leave the client with a pooled socket the
 * server has already closed, which surfaces as ECONNRESET on the next call.
 */
async function fetchRetry(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return fetch(url, options);
  }
}

module.exports = { seed, seedDemo, seedEmpty, fetchRetry };
