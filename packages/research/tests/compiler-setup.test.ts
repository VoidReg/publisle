import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute:
    vi.fn<
      (
        command: string,
        args: string[],
        options: unknown,
      ) => Promise<{ stdout: string; stderr: string }>
    >(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFile: (...args: unknown[]) => {
    const callback = args.pop() as (
      error: Error | null,
      result?: { stdout: string; stderr: string },
    ) => void;
    mocks.execute(args[0] as string, args[1] as string[], args[2]).then(
      (result: { stdout: string; stderr: string }) => {
        callback(null, result);
      },
      (error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)));
      },
    );
  },
}));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  mkdir: mocks.mkdir,
}));
import { setupCompiler } from "../src/node.ts";

const image = `sha256:${"a".repeat(64)}`;
const published = `ghcr.io/voidreg/publisle-compiler@sha256:${"b".repeat(64)}`;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.readFile.mockResolvedValue(
    JSON.stringify({ recipeVersion: 2, publishedImage: published }),
  );
  mocks.execute.mockImplementation((_command: string, args: string[]) =>
    Promise.resolve({
      stdout:
        args[0] === "image"
          ? JSON.stringify([
              {
                Id: image,
                RepoDigests: [published],
                Os: "linux",
                Architecture: "arm64",
              },
            ])
          : "",
      stderr: "",
    }),
  );
});
it("pulls the published digest and records the immutable platform image", async () => {
  expect(await setupCompiler()).toBe(image);
  expect(mocks.execute.mock.calls[0]?.[1]).toEqual(["pull", published]);
  expect(JSON.parse(mocks.writeFile.mock.calls[0]?.[1] as string)).toEqual({
    image,
    recipeVersion: 2,
    platform: "linux/arm64",
    publishedImage: published,
  });
});
it("lets an explicit local build bypass the published release", async () => {
  await setupCompiler({ localBuild: true });
  expect(mocks.execute.mock.calls[0]?.[1][0]).toBe("build");
  expect(mocks.execute.mock.calls.some((call) => call[1][0] === "pull")).toBe(
    false,
  );
});
it("uses a local build while publication metadata is pending", async () => {
  mocks.readFile.mockResolvedValue(
    JSON.stringify({ recipeVersion: 2, publishedImage: null }),
  );
  await setupCompiler();
  expect(mocks.execute.mock.calls[0]?.[1][0]).toBe("build");
});
it("rejects mutable image references before invoking Docker", async () => {
  await expect(
    setupCompiler({ image: "ghcr.io/voidreg/publisle-compiler:latest" }),
  ).rejects.toThrow("immutable");
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("refuses to record a different registry digest", async () => {
  mocks.execute.mockResolvedValue({
    stdout: JSON.stringify([
      { Id: image, RepoDigests: [], Os: "linux", Architecture: "amd64" },
    ]),
    stderr: "",
  });
  await expect(setupCompiler()).rejects.toThrow("does not match");
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
it("reports pull failure with the explicit local-build fallback", async () => {
  mocks.execute.mockRejectedValue(new Error("registry unavailable"));
  await expect(setupCompiler()).rejects.toThrow("--build");
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
