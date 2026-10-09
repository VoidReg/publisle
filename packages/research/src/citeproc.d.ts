declare module "citeproc" {
  interface Citation {
    citationID: string;
    citationItems: Record<string, unknown>[];
    properties: { noteIndex: number };
  }
  interface Processor {
    setOutputFormat(format: string): void;
    processCitationCluster(
      citation: Citation,
      pre: [string, number][],
      post: [string, number][],
    ): [unknown, [number, string, string][]];
    makeBibliography(): false | [{ entry_ids: string[][] }, string[]];
  }
  const CSL: {
    Engine: new (
      system: {
        retrieveLocale: (language: string) => string;
        retrieveItem: (id: string) => Readonly<Record<string, unknown>>;
      },
      style: string,
      locale: string,
      forceLocale?: boolean,
    ) => Processor;
  };
  export default CSL;
}
