export type IiifSourceVersion = "image-2" | "image-3" | "presentation-2" | "presentation-3";

export type IiifImageService = {
  id: string;
  api_version: "2" | "3";
  profile: string | null;
  width: number | null;
  height: number | null;
  info_json_url: string;
  full_image_url: string;
};

export type IiifImageCandidate = {
  id: string;
  format: string | null;
  width: number | null;
  height: number | null;
  service: IiifImageService | null;
};

export type IiifCanvas = {
  id: string;
  label: string | null;
  width: number | null;
  height: number | null;
  images: IiifImageCandidate[];
};

export type IiifInspection = {
  kind: "image_service" | "manifest";
  version: IiifSourceVersion;
  id: string;
  label: string | null;
  image_service: IiifImageService | null;
  canvases: IiifCanvas[];
};

export class IiifParseError extends Error {
  readonly code: "IIIF.INVALID_STRUCTURE" | "IIIF.UNSUPPORTED_RESOURCE";

  constructor(code: IiifParseError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function contextStrings(value: unknown): string[] {
  return array(value).flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    return [];
  });
}

function firstProfile(value: unknown): string | null {
  for (const entry of array(value)) {
    if (typeof entry === "string") return entry;
    if (isObject(entry)) {
      const id = string(entry.id) ?? string(entry["@id"]);
      if (id) return id;
    }
  }
  return null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function infoJsonUrl(serviceId: string): string {
  const base = stripTrailingSlash(serviceId);
  return base.endsWith("/info.json") ? base : `${base}/info.json`;
}

function serviceBaseUrl(serviceId: string): string {
  return stripTrailingSlash(serviceId).replace(/\/info\.json$/i, "");
}

function fullImageUrl(serviceId: string, version: "2" | "3"): string {
  const base = serviceBaseUrl(serviceId);
  return `${base}/full/${version === "3" ? "max" : "full"}/0/default.jpg`;
}

function multilingualLabel(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = multilingualLabel(item);
      if (candidate) return candidate;
    }
    return null;
  }
  if (!isObject(value)) return null;

  const preferredKeys = ["none", "en", "fr"];
  for (const key of preferredKeys) {
    const values = value[key];
    if (!Array.isArray(values)) continue;
    const candidate = values.find((entry) => typeof entry === "string" && entry.trim());
    if (typeof candidate === "string") return candidate.trim();
  }
  for (const values of Object.values(value)) {
    if (!Array.isArray(values)) continue;
    const candidate = values.find((entry) => typeof entry === "string" && entry.trim());
    if (typeof candidate === "string") return candidate.trim();
  }
  return null;
}

function detectImageServiceVersion(value: JsonObject): "2" | "3" | null {
  const type = string(value.type) ?? string(value["@type"]);
  if (type === "ImageService3") return "3";
  if (type === "ImageService2" || type === "iiif:Image") return "2";

  const contexts = contextStrings(value["@context"]);
  if (contexts.some((entry) => /\/api\/image\/3(?:\/|\/context\.json|$)/.test(entry))) return "3";
  if (contexts.some((entry) => /\/api\/image\/2(?:\/|\/context\.json|$)/.test(entry))) return "2";

  const profile = firstProfile(value.profile);
  if (profile?.includes("/api/image/3/")) return "3";
  if (profile?.includes("/api/image/2/")) return "2";
  return null;
}

function normalizeImageServiceReference(value: unknown): IiifImageService | null {
  if (!isObject(value)) return null;
  const id = string(value.id) ?? string(value["@id"]);
  if (!id) return null;
  const version = detectImageServiceVersion(value);
  if (!version) return null;
  return {
    id: serviceBaseUrl(id),
    api_version: version,
    profile: firstProfile(value.profile),
    width: positiveNumber(value.width),
    height: positiveNumber(value.height),
    info_json_url: infoJsonUrl(id),
    full_image_url: fullImageUrl(id, version),
  };
}

function services(value: unknown): IiifImageService[] {
  return array(value)
    .map(normalizeImageServiceReference)
    .filter((entry): entry is IiifImageService => entry !== null);
}

function normalizeImageCandidate(value: unknown): IiifImageCandidate | null {
  if (!isObject(value)) return null;
  const id = string(value.id) ?? string(value["@id"]);
  if (!id) return null;
  const service = services(value.service)[0] ?? null;
  return {
    id,
    format: string(value.format),
    width: positiveNumber(value.width),
    height: positiveNumber(value.height),
    service,
  };
}

function parseImageInfo(value: JsonObject): IiifInspection | null {
  const version = detectImageServiceVersion(value);
  const protocol = string(value.protocol);
  const id = string(value.id) ?? string(value["@id"]);
  const width = positiveNumber(value.width);
  const height = positiveNumber(value.height);

  const looksLikeInfo = protocol === "http://iiif.io/api/image" || Boolean(version && width && height);
  if (!looksLikeInfo) return null;
  if (!version) {
    throw new IiifParseError("IIIF.UNSUPPORTED_RESOURCE", "Image information resembles IIIF but its Image API version could not be determined.");
  }
  if (!id) throw new IiifParseError("IIIF.INVALID_STRUCTURE", "IIIF Image information is missing its service identifier.");
  if (!width || !height) throw new IiifParseError("IIIF.INVALID_STRUCTURE", "IIIF Image information must provide positive width and height values.");

  const service: IiifImageService = {
    id: serviceBaseUrl(id),
    api_version: version,
    profile: firstProfile(value.profile),
    width,
    height,
    info_json_url: infoJsonUrl(id),
    full_image_url: fullImageUrl(id, version),
  };
  return {
    kind: "image_service",
    version: version === "3" ? "image-3" : "image-2",
    id: service.id,
    label: null,
    image_service: service,
    canvases: [],
  };
}

function detectPresentationVersion(value: JsonObject): "2" | "3" | null {
  const contexts = contextStrings(value["@context"]);
  const type = string(value.type) ?? string(value["@type"]);
  if (contexts.some((entry) => /\/api\/presentation\/3(?:\/|\/context\.json|$)/.test(entry))) return "3";
  if (contexts.some((entry) => /\/api\/presentation\/2(?:\/|\/context\.json|$)/.test(entry))) return "2";
  if (type === "sc:Manifest") return "2";
  return null;
}

function normalizeV3Body(value: unknown): IiifImageCandidate[] {
  return array(value)
    .map(normalizeImageCandidate)
    .filter((entry): entry is IiifImageCandidate => entry !== null);
}

function normalizeV3Canvas(value: unknown): IiifCanvas | null {
  if (!isObject(value) || string(value.type) !== "Canvas") return null;
  const id = string(value.id);
  if (!id) return null;
  const images: IiifImageCandidate[] = [];
  for (const annotationPageValue of array(value.items)) {
    if (!isObject(annotationPageValue)) continue;
    for (const annotationValue of array(annotationPageValue.items)) {
      if (!isObject(annotationValue)) continue;
      const motivations = array(annotationValue.motivation).filter((entry): entry is string => typeof entry === "string");
      if (!motivations.includes("painting")) continue;
      images.push(...normalizeV3Body(annotationValue.body));
    }
  }
  return {
    id,
    label: multilingualLabel(value.label),
    width: positiveNumber(value.width),
    height: positiveNumber(value.height),
    images,
  };
}

function normalizeV2Canvas(value: unknown): IiifCanvas | null {
  if (!isObject(value)) return null;
  const id = string(value["@id"]);
  if (!id) return null;
  const images: IiifImageCandidate[] = [];
  for (const annotationValue of array(value.images)) {
    if (!isObject(annotationValue)) continue;
    const resource = normalizeImageCandidate(annotationValue.resource);
    if (resource) images.push(resource);
  }
  return {
    id,
    label: multilingualLabel(value.label),
    width: positiveNumber(value.width),
    height: positiveNumber(value.height),
    images,
  };
}

function parseManifest(value: JsonObject): IiifInspection | null {
  const version = detectPresentationVersion(value);
  const type = string(value.type) ?? string(value["@type"]);
  const looksLikeManifest = type === "Manifest" || type === "sc:Manifest" || Boolean(version && (value.items || value.sequences));
  if (!looksLikeManifest) return null;
  if (!version) throw new IiifParseError("IIIF.UNSUPPORTED_RESOURCE", "Manifest-like JSON has no supported IIIF Presentation 2 or 3 context.");

  const id = version === "3" ? string(value.id) : string(value["@id"]);
  if (!id) throw new IiifParseError("IIIF.INVALID_STRUCTURE", "IIIF Manifest is missing its identifier.");

  let canvases: IiifCanvas[] = [];
  if (version === "3") {
    canvases = array(value.items).map(normalizeV3Canvas).filter((entry): entry is IiifCanvas => entry !== null);
  } else {
    const sequence = array(value.sequences).find(isObject);
    if (sequence) canvases = array(sequence.canvases).map(normalizeV2Canvas).filter((entry): entry is IiifCanvas => entry !== null);
  }
  if (!canvases.length) throw new IiifParseError("IIIF.INVALID_STRUCTURE", "IIIF Manifest contains no usable Canvas resources.");

  return {
    kind: "manifest",
    version: version === "3" ? "presentation-3" : "presentation-2",
    id,
    label: multilingualLabel(value.label),
    image_service: null,
    canvases,
  };
}

export function parseIiifJson(value: unknown): IiifInspection {
  if (!isObject(value)) throw new IiifParseError("IIIF.INVALID_STRUCTURE", "IIIF input must be a JSON object.");
  const imageInfo = parseImageInfo(value);
  if (imageInfo) return imageInfo;
  const manifest = parseManifest(value);
  if (manifest) return manifest;
  throw new IiifParseError("IIIF.UNSUPPORTED_RESOURCE", "JSON is not a supported IIIF Image 2/3 info document or Presentation 2/3 Manifest.");
}

export function inferIiifInputUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new IiifParseError("IIIF.INVALID_STRUCTURE", "IIIF URL is empty.");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new IiifParseError("IIIF.INVALID_STRUCTURE", "IIIF source must be an absolute HTTP(S) URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IiifParseError("IIIF.INVALID_STRUCTURE", "IIIF source must use HTTP or HTTPS.");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  const looksLikeJson = pathname.endsWith(".json") || pathname.endsWith("manifest") || pathname.endsWith("manifest.json");
  if (!looksLikeJson) url.pathname = `${pathname}/info.json`;
  return url.toString();
}
