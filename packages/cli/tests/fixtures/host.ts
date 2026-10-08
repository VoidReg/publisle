import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
import type { CliConfig } from "../../src/index.ts";
import {
  noticeCodec,
  noticeDefinition,
} from "../../../markdown/tests/fixtures/notice-codec.ts";

export default {
  prepare: {
    registry: createRegistry([...coreBlockDefinitions, noticeDefinition]),
  },
  markdown: { codecs: [noticeCodec] },
} satisfies CliConfig;
