// Writes src/data/spec-dates.json with when each environment's spec last changed.
// Test: last commit touching the committed spec. Prod: publish date of the latest release.
// Prod: publish date of the release named by RELEASE_TAG, else the latest release.
// Missing history or gh access leaves a date null, which the Environments page renders as "Not yet published".
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

const tag = process.env.RELEASE_TAG;
const dates = {
  test: run("git", ["log", "-1", "--format=%cI", "--", "public/openapi/test.json"]),
  prod: run("gh", ["release", "view", ...(tag ? [tag] : []), "--json", "publishedAt", "--jq", ".publishedAt"]),
};

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/spec-dates.json", `${JSON.stringify(dates, null, 2)}\n`);
console.log("Spec dates:", dates);
