import type { PublicationReaderManifest } from "@publisle/adapter-core";
import {
  attachPublication,
  type PublicationEnvironment,
} from "@publisle/adapter-core/publication-runtime";
/** Called by a host island; returns disposal for Astro navigation/unmount lifecycle. */
export function attachArticle(
  root: HTMLElement,
  manifest: PublicationReaderManifest,
  environment: PublicationEnvironment,
): () => void {
  const handle = attachPublication(root, manifest, environment);
  return () => handle.dispose();
}
