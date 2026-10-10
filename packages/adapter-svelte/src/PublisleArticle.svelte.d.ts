import type { Component } from "svelte";
import type {
  PublicationArtifact,
  PublicationEnvironment,
} from "@publisle/adapter-core";

declare const PublisleArticle: Component<{
  publication: PublicationArtifact;
  instanceId: string;
  implementations?: PublicationEnvironment["implementations"];
  services?: PublicationEnvironment["services"];
}>;
export default PublisleArticle;
