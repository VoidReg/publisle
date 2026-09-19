export class SchemaParseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SchemaParseError";
    this.code = code;
  }
}
