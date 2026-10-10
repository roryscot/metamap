import { readFileSync } from "node:fs";
import { parseRelationPack } from "./relation-pack.js";
import type { ExecutableRelationPack } from "./model.js";

export const SCIENTIFIC_SKOS_PACK_ID =
  "urn:metamap:relation-pack:scientific-skos";
export const SCIENTIFIC_SKOS_PACK_VERSION = "1.0.0";
export const SCIENTIFIC_SKOS_PREDICATES: Readonly<Record<string, string>> =
  Object.freeze({
    "http://www.w3.org/2004/02/skos/core#exactMatch": "scientific:exact-match",
    "http://www.w3.org/2004/02/skos/core#closeMatch": "scientific:close-match",
    "http://www.w3.org/2004/02/skos/core#broadMatch": "scientific:broad-match",
    "http://www.w3.org/2004/02/skos/core#narrowMatch":
      "scientific:narrow-match",
    "http://www.w3.org/2004/02/skos/core#relatedMatch":
      "scientific:related-match",
  });

/** A fresh parsed pack prevents consumer mutation of the bundled normative profile. */
export function scientificSkosRelationPack(): ExecutableRelationPack {
  const pack = parseRelationPack(
    JSON.parse(
      readFileSync(
        new URL("../relation-packs/scientific-skos.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  if (
    pack.schemaVersion !== "2.0.0" ||
    pack.id !== SCIENTIFIC_SKOS_PACK_ID ||
    pack.version !== SCIENTIFIC_SKOS_PACK_VERSION
  )
    throw new Error(
      "Bundled scientific SKOS profile has an unexpected identity",
    );
  return pack;
}
