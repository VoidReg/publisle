"use client";
import { ClientAttachment } from "@publisle/adapter-next/client";
import type { PublicationReaderManifest } from "@publisle/adapter-core";
const implementations = { "host:counter": () => import("./Counter.tsx") };
export default function Reader({
  manifest,
  instanceId,
}: {
  manifest: PublicationReaderManifest;
  instanceId: string;
}) {
  return (
    <ClientAttachment
      manifest={manifest}
      instanceId={instanceId}
      implementations={implementations}
    />
  );
}
