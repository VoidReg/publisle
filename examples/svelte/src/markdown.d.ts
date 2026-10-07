declare module "*.md" {
  import type { Diagnostic, PublicationMetadata } from "@publisle/schema";
  import type { PublicationArtifact } from "@publisle/adapter-core";
  export const publication: PublicationArtifact;
  export const metadata: PublicationMetadata | null;
  export const diagnostics: readonly Diagnostic[];
}
