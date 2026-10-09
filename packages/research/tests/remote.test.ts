import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect, vi } from "vitest";
import { lookupDoi, fetchBibliography, importCslJson } from "../src/remote.ts";
it("fetches explicitly, caches provenance, and reuses metadata offline", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "publisle-doi-"));
  try {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "doi",
          type: "article-journal",
          title: "Remote",
          DOI: "10.1000/test",
          author: [{ family: "Doe", given: "Jane", suffix: "Jr." }],
          issued: { "date-parts": [[2024, 3, 1]] },
        }),
        {
          headers: {
            "content-type": "application/vnd.citationstyles.csl+json",
          },
        },
      ),
    );
    const result = await lookupDoi("10.1000/test", { cacheDirectory, fetch });
    expect(result.entries[0]?.title).toBe("Remote");
    expect(result.items[0]?.["author"]).toEqual([
      { family: "Doe", given: "Jane", suffix: "Jr." },
    ]);
    expect(result.provenance.sha256).toMatch(/^[a-f0-9]{64}$/u);
    const offline = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error("offline"));
    expect(
      await lookupDoi("10.1000/test", { cacheDirectory, fetch: offline }),
    ).toEqual(result);
    expect(offline).not.toHaveBeenCalled();
    await expect(
      lookupDoi("10.1000/test", {
        cacheDirectory,
        refresh: true,
        fetch: offline,
      }),
    ).rejects.toThrow("offline");
    await expect(
      fetchBibliography("http://example.com/refs", { cacheDirectory, fetch }),
    ).rejects.toThrow("HTTPS");
    await expect(
      lookupDoi("invalid", { cacheDirectory, fetch }),
    ).rejects.toThrow("DOI");
  } finally {
    await rm(cacheDirectory, { recursive: true, force: true });
  }
});
it("normalizes CSL JSON while retaining its full records", () => {
  const result = importCslJson(
    '[{"id":"corp","author":[{"literal":"Research Group"}],"title":"A study","editor":[{"family":"Editor"}]}]',
  );
  expect(result.entries[0]?.authors).toEqual(["Research Group"]);
  expect(result.items[0]?.["editor"]).toEqual([{ family: "Editor" }]);
});
