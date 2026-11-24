// Creates an empty Prod spec when none has been downloaded, so the docs build and dev server
// work before the first release. Never overwrites an existing (downloaded) spec.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const file = "public/openapi/prod.json";

if (!existsSync(file)) {
  const placeholder = {
    openapi: "3.0.0",
    info: {
      title: "Address Change API",
      version: "unreleased",
      description: "No production release has been published yet.",
    },
    paths: {},
  };
  mkdirSync("public/openapi", { recursive: true });
  writeFileSync(file, `${JSON.stringify(placeholder, null, 2)}\n`);
  console.log("Created placeholder Prod spec.");
}
