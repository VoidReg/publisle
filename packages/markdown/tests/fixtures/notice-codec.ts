import type { PortableBlockDefinition } from "@publisle/core";
import { isPlainObject } from "@publisle/schema";
import type { MarkdownBlockCodec } from "../../src/index.ts";

export const noticeDefinition: PortableBlockDefinition<
  "demo:notice",
  { message: string }
> = {
  type: "demo:notice",
  schemaVersion: 2,
  schema: {
    parse(value) {
      if (!isPlainObject(value) || typeof value["message"] !== "string")
        throw new Error("Notice message must be a string.");
      return { message: value["message"] };
    },
  },
  migrations: [
    {
      from: 1,
      migrate(value) {
        if (!isPlainObject(value) || typeof value["text"] !== "string")
          throw new Error("Legacy notice text must be a string.");
        return { message: value["text"] };
      },
    },
  ],
};

/** Example user-owned codec: payload schemas/migrations remain in its separate definition. */
export const noticeCodec: MarkdownBlockCodec = {
  type: noticeDefinition.type,
  directive: "notice",
  schemaVersion: noticeDefinition.schemaVersion,
  decode(node, { schemaVersion }) {
    const message = node.attributes?.["message"];
    if (typeof message !== "string")
      throw new Error("Notice directive needs a message.");
    return schemaVersion === 1 ? { text: message } : { message };
  },
  encode(block, { policy }) {
    if (!isPlainObject(block.data)) return undefined;
    const message = block.data[block.schemaVersion === 1 ? "text" : "message"];
    if (typeof message !== "string") return undefined;
    return policy === "standard"
      ? {
          type: "paragraph",
          children: [{ type: "text", value: `Notice: ${message}` }],
        }
      : {
          type: "containerDirective",
          name: "notice",
          attributes: { message },
          children: [],
        };
  },
};
