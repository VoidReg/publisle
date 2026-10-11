export {
  SEGMENT_KINDS,
  appendSegment,
  fieldValue,
  inlineSegments,
  listText,
  metadataAuthors,
  metadataField,
  metadataSubjects,
  removeSegment,
  setFieldJson,
  setFieldValue,
  setListText,
  setSegmentText,
  withMetadataAuthors,
  withMetadataField,
  withMetadataSubjects,
  type AuthorRow,
  type FieldSpec,
  type FieldValue,
  type InlineSegment,
} from "@publisle/playground";
import { blockFields as coreBlockFields } from "@publisle/playground";
import { DEMO_EXTENSIONS } from "./templates.ts";

/** Field specs per block type, extended with the demo blocks. */
export function blockFields(type: string) {
  return coreBlockFields(type, DEMO_EXTENSIONS);
}
