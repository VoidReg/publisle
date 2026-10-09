import { createElement, type ReactNode } from "react";
import {
  instantiatePublication,
  type PublicationArtifact,
} from "@publisle/adapter-core/publication-runtime";
export {
  loadPublication,
  preparePublication,
  type LocalPublicationOptions,
} from "@publisle/adapter-core/node";
/** App Router server component. Add a host-owned ClientAttachment only for articles with islands. */
export function PublisleArticle({
  publication,
  instanceId,
  children,
}: {
  readonly publication: PublicationArtifact;
  readonly instanceId: string;
  readonly children?: ReactNode;
}): ReactNode {
  const placement = instantiatePublication(publication, instanceId);
  return createElement(
    "div",
    { "data-publisle-article": instanceId },
    createElement("div", {
      "data-publisle-content": true,
      dangerouslySetInnerHTML: { __html: placement.html },
    }),
    children,
  );
}
