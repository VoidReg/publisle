import { SchemaParseError } from "./error.ts";
import { isJsonValue, type JsonValue } from "./json.ts";
import { isPlainObject, readField } from "./object.ts";

export type IsoDateTime = string & {
  readonly __brand: "IsoDateTime";
};

const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isIsoDateTime(value: string): value is IsoDateTime {
  return ISO_DATE_TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

export function parseIsoDateTime(value: string): IsoDateTime {
  if (!isIsoDateTime(value)) {
    throw new SchemaParseError(
      "invalid-iso-date-time",
      `Expected an ISO-8601 date-time, received ${JSON.stringify(value)}.`,
    );
  }

  return value;
}

export interface Author {
  name: string;
  affiliation?: string;
  identifiers?: Record<string, string>;
}

export interface LicenseReference {
  name?: string;
  url?: string;
  identifier?: string;
}

export interface ImageReference {
  src: string;
  alt?: string;
}

export interface PublicationMetadata {
  documentType?: string;
  title?: string;
  description?: string;
  language?: string;
  authors?: Author[];
  publishedAt?: IsoDateTime;
  modifiedAt?: IsoDateTime;
  identifiers?: Record<string, string>;
  license?: LicenseReference;
  subjects?: string[];
  image?: ImageReference;
  /** Namespaced or source-format metadata not covered by the portable fields. */
  extensions?: Record<string, JsonValue>;
}

export interface SerializedPublicationMetadata {
  documentType?: string;
  title?: string;
  description?: string;
  language?: string;
  authors?: Author[];
  publishedAt?: string;
  modifiedAt?: string;
  identifiers?: Record<string, string>;
  license?: LicenseReference;
  subjects?: string[];
  image?: ImageReference;
  extensions?: Record<string, JsonValue>;
}

function readOptionalString(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const entry = readField(value, field);

  if (entry === undefined) {
    return undefined;
  }

  if (typeof entry !== "string") {
    throw new SchemaParseError(
      "invalid-document",
      `metadata.${field} must be a string.`,
    );
  }

  return entry;
}

function parseStringRecord(
  value: unknown,
  field: string,
): Record<string, string> {
  if (!isPlainObject(value)) {
    throw new SchemaParseError(
      "invalid-document",
      `metadata.${field} must be an object of strings.`,
    );
  }

  const record: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new SchemaParseError(
        "invalid-document",
        `metadata.${field}.${key} must be a string.`,
      );
    }

    record[key] = entry;
  }

  return record;
}

function parseAuthor(value: unknown): Author {
  if (!isPlainObject(value)) {
    throw new SchemaParseError(
      "invalid-document",
      "metadata.authors[] must be an object with a name.",
    );
  }

  const name = readField(value, "name");
  const affiliation = readField(value, "affiliation");
  const identifiers = readField(value, "identifiers");

  if (typeof name !== "string") {
    throw new SchemaParseError(
      "invalid-document",
      "metadata.authors[] must be an object with a name.",
    );
  }

  const author: Author = {
    name,
  };

  if (affiliation !== undefined) {
    if (typeof affiliation !== "string") {
      throw new SchemaParseError(
        "invalid-document",
        "metadata.authors[].affiliation must be a string.",
      );
    }

    author.affiliation = affiliation;
  }

  if (identifiers !== undefined) {
    author.identifiers = parseStringRecord(
      identifiers,
      "authors[].identifiers",
    );
  }

  return author;
}

function parseLicenseReference(value: unknown): LicenseReference {
  if (!isPlainObject(value)) {
    throw new SchemaParseError(
      "invalid-document",
      "metadata.license must be an object.",
    );
  }

  const license: LicenseReference = {};
  const name = readOptionalString(value, "name");
  const url = readOptionalString(value, "url");
  const identifier = readOptionalString(value, "identifier");

  if (name !== undefined) {
    license.name = name;
  }

  if (url !== undefined) {
    license.url = url;
  }

  if (identifier !== undefined) {
    license.identifier = identifier;
  }

  return license;
}

function parseImageReference(value: unknown): ImageReference {
  if (!isPlainObject(value)) {
    throw new SchemaParseError(
      "invalid-document",
      "metadata.image must be an object with a src.",
    );
  }

  const src = readField(value, "src");
  const alt = readField(value, "alt");

  if (typeof src !== "string") {
    throw new SchemaParseError(
      "invalid-document",
      "metadata.image must be an object with a src.",
    );
  }

  const image: ImageReference = {
    src,
  };

  if (alt !== undefined) {
    if (typeof alt !== "string") {
      throw new SchemaParseError(
        "invalid-document",
        "metadata.image.alt must be a string.",
      );
    }

    image.alt = alt;
  }

  return image;
}

export function parsePublicationMetadata(value: unknown): PublicationMetadata {
  if (!isPlainObject(value)) {
    throw new SchemaParseError(
      "invalid-document",
      "Publication metadata must be an object.",
    );
  }

  const metadata: PublicationMetadata = {};
  const documentType = readOptionalString(value, "documentType");
  const title = readOptionalString(value, "title");
  const description = readOptionalString(value, "description");
  const language = readOptionalString(value, "language");

  if (documentType !== undefined) {
    metadata.documentType = documentType;
  }

  if (title !== undefined) {
    metadata.title = title;
  }

  if (description !== undefined) {
    metadata.description = description;
  }

  if (language !== undefined) {
    metadata.language = language;
  }

  const authors = readField(value, "authors");
  const publishedAt = readField(value, "publishedAt");
  const modifiedAt = readField(value, "modifiedAt");
  const identifiers = readField(value, "identifiers");
  const license = readField(value, "license");
  const subjects = readField(value, "subjects");
  const image = readField(value, "image");
  const extensions = readField(value, "extensions");

  if (authors !== undefined) {
    if (!Array.isArray(authors)) {
      throw new SchemaParseError(
        "invalid-document",
        "metadata.authors must be an array.",
      );
    }

    metadata.authors = authors.map((author) => parseAuthor(author));
  }

  if (publishedAt !== undefined) {
    if (typeof publishedAt !== "string") {
      throw new SchemaParseError(
        "invalid-document",
        "metadata.publishedAt must be a string.",
      );
    }

    metadata.publishedAt = parseIsoDateTime(publishedAt);
  }

  if (modifiedAt !== undefined) {
    if (typeof modifiedAt !== "string") {
      throw new SchemaParseError(
        "invalid-document",
        "metadata.modifiedAt must be a string.",
      );
    }

    metadata.modifiedAt = parseIsoDateTime(modifiedAt);
  }

  if (identifiers !== undefined) {
    metadata.identifiers = parseStringRecord(identifiers, "identifiers");
  }

  if (license !== undefined) {
    metadata.license = parseLicenseReference(license);
  }

  if (subjects !== undefined) {
    if (!Array.isArray(subjects)) {
      throw new SchemaParseError(
        "invalid-document",
        "metadata.subjects must be an array of strings.",
      );
    }

    metadata.subjects = subjects.map((subject) => {
      if (typeof subject !== "string") {
        throw new SchemaParseError(
          "invalid-document",
          "metadata.subjects must be an array of strings.",
        );
      }

      return subject;
    });
  }

  if (image !== undefined) {
    metadata.image = parseImageReference(image);
  }

  if (extensions !== undefined) {
    if (!isPlainObject(extensions) || !isJsonValue(extensions)) {
      throw new SchemaParseError(
        "invalid-document",
        "metadata.extensions must be a JSON-compatible object.",
      );
    }
    metadata.extensions = extensions;
  }

  return metadata;
}
