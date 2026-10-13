import { readdir, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const directory = process.env.PDF_JOB_DIRECTORY ?? "/var/lib/publisle-pdf/jobs";
await mkdir(directory, { recursive: true, mode: 0o700 });
for (const entry of await readdir(directory)) {
  if (entry.startsWith("publisle-pdf-"))
    await rm(join(directory, entry), { recursive: true, force: true });
}
// Only this service's labeled workers may be removed on restart.
const containers = await execute(
  "docker",
  ["ps", "-aq", "--filter", "label=publisle.pdf=true"],
  { timeout: 5000 },
).catch(() => ({ stdout: "" }));
const ids = containers.stdout
  .trim()
  .split(/\s+/)
  .filter((id) => /^[a-f0-9]{12,64}$/.test(id));
if (ids.length)
  await execute("docker", ["rm", "--force", ...ids], { timeout: 10000 });
