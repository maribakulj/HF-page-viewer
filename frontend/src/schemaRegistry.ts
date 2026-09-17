import type { PageDocumentDTO } from "./types";

export type SchemaResource = {
  virtualUrl: string;
  assetPath: string;
};

export type SchemaDescriptor = {
  id: string;
  label: string;
  sourceFormat: PageDocumentDTO["source_format"];
  sourceVersion: string;
  namespace: string;
  entryVirtualUrl: string;
  entryAssetPath: string;
  resources: SchemaResource[];
};

const ALTO_44: SchemaDescriptor = {
  id: "alto-4.4",
  label: "ALTO 4.4",
  sourceFormat: "alto",
  sourceVersion: "4.4",
  namespace: "http://www.loc.gov/standards/alto/ns-v4#",
  entryVirtualUrl: "https://schemas.hf-page-viewer.invalid/alto-4-4.xsd",
  entryAssetPath: "schemas/alto-4-4.xsd",
  resources: [
    {
      virtualUrl: "http://www.loc.gov/standards/xlink/xlink.xsd",
      assetPath: "schemas/xlink.xsd",
    },
  ],
};

const PAGE_2019: SchemaDescriptor = {
  id: "page-2019-07-15",
  label: "PAGE XML 2019-07-15",
  sourceFormat: "page_xml",
  sourceVersion: "2019-07-15",
  namespace: "http://schema.primaresearch.org/PAGE/gts/pagecontent/2019-07-15",
  entryVirtualUrl: "https://schemas.hf-page-viewer.invalid/pagecontent-2019-07-15.xsd",
  entryAssetPath: "schemas/pagecontent-2019-07-15.xsd",
  resources: [],
};

export const PINNED_SCHEMAS: readonly SchemaDescriptor[] = [ALTO_44, PAGE_2019];

export type SchemaResolution =
  | { status: "supported"; descriptor: SchemaDescriptor }
  | { status: "unsupported"; reason: string };

export function resolveSchema(document: Pick<PageDocumentDTO, "source_format" | "source_version" | "namespace">): SchemaResolution {
  const match = PINNED_SCHEMAS.find((candidate) => (
    candidate.sourceFormat === document.source_format
    && candidate.sourceVersion === document.source_version
    && candidate.namespace === document.namespace
  ));
  if (match) return { status: "supported", descriptor: match };

  const format = document.source_format === "alto" ? "ALTO" : "PAGE XML";
  return {
    status: "unsupported",
    reason: `No pinned XSD is registered for ${format} ${document.source_version ?? "unknown version"} (${document.namespace ?? "no namespace"}).`,
  };
}
