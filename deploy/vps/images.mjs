import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LIMITS, ServiceError } from "./limits.mjs";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
])
  blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
])
  blocked.addSubnet(address, prefix, "ipv6");

export function isPublicAddress(address) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}

export async function imageDestination(source, baseUrl, resolve = lookup) {
  if (source.length > 2048)
    throw new ServiceError(
      "unsafe-image-url",
      "Image URL exceeds 2048 characters.",
    );
  let url;
  try {
    url = new URL(source, baseUrl);
  } catch {
    throw new ServiceError("unsafe-image-url", "Invalid image URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new ServiceError(
      "unsafe-image-url",
      "Images require public HTTPS URLs without credentials.",
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const records = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolve(hostname, { all: true, verbatim: true });
  if (
    !records.length ||
    records.some(({ address }) => !isPublicAddress(address))
  )
    throw new ServiceError(
      "unsafe-image-url",
      "Image destinations must use public IP addresses.",
    );
  return { url, address: records[0].address, family: records[0].family };
}

// Keep TLS hostname verification while pinning the TCP connection to a checked
// address. Redirects are handled manually and each destination is revalidated.
function download(destination, signal, maxBytes) {
  return new Promise((resolve, reject) => {
    const { url, address, family } = destination;
    const req = httpsRequest(
      url,
      {
        signal,
        agent: false,
        headers: {
          accept: "image/png,image/jpeg,image/svg+xml",
          "accept-encoding": "identity",
          "user-agent": "Publisle-PDF/1",
        },
        lookup: (_hostname, options, done) =>
          options.all
            ? done(null, [{ address, family }])
            : done(null, address, family),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.destroy();
          resolve({ location: response.headers.location });
          return;
        }
        const mime = response.headers["content-type"]
          ?.split(";")[0]
          ?.trim()
          .toLowerCase();
        if (
          status !== 200 ||
          !["image/png", "image/jpeg", "image/svg+xml"].includes(mime) ||
          (response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity")
        ) {
          response.destroy();
          reject(
            new ServiceError(
              "invalid-image",
              "Image fetch failed or returned an unsupported format.",
            ),
          );
          return;
        }
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes)
            response.destroy(
              new ServiceError(
                "image-limit",
                "Image download exceeds its byte limit.",
              ),
            );
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({ bytes: Buffer.concat(chunks), mime }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function fetchImages(
  sources,
  directory,
  signal,
  baseUrl,
  dependencies = {},
) {
  const unique = [...new Set(sources)];
  if (unique.length > LIMITS.imageCount)
    throw new ServiceError("image-limit", "Too many distinct images.");
  let total = 0;
  const assets = [];
  for (const source of unique) {
    const fetchSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(LIMITS.fetchMs),
    ]);
    let destination = source;
    let result;
    for (let hop = 0; hop <= LIMITS.redirects; hop++) {
      const checked = await imageDestination(
        destination,
        baseUrl,
        dependencies.resolve,
      );
      fetchSignal.throwIfAborted();
      result = await (dependencies.download ?? download)(
        checked,
        fetchSignal,
        Math.min(LIMITS.imageBytes, LIMITS.totalImageBytes - total),
      );
      if (result.bytes) break;
      if (!result.location || hop === LIMITS.redirects)
        throw new ServiceError(
          "invalid-image",
          "Image redirect limit exceeded.",
        );
      destination = new URL(result.location, checked.url).href;
    }
    if (!result?.bytes?.length)
      throw new ServiceError("invalid-image", "Image is empty.");
    total += result.bytes.length;
    if (
      result.bytes.length > LIMITS.imageBytes ||
      total > LIMITS.totalImageBytes
    )
      throw new ServiceError(
        "image-limit",
        "Images exceed the download limit.",
      );
    const file = `image-${assets.length}.input`;
    await writeFile(join(directory, file), result.bytes, {
      flag: "wx",
      mode: 0o644,
    });
    assets.push({ source, file, mime: result.mime });
  }
  return assets;
}
