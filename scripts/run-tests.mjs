import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

async function collectTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectTests(path));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }

  return files;
}

const files = (await collectTests("test")).sort();

if (files.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

console.log(`Running ${files.length} test files...`);

const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--require",
    "tsx/cjs",
    ...files
  ],
  {
    stdio: "inherit",
    shell: false
  }
);

process.exit(result.status ?? 1);
