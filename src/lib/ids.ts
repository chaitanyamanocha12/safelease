import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijkmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 18);

/** Prefixed, URL-safe, non-sequential identifiers (e.g. inv_4k2…). */
export function newId(prefix: string): string {
  return `${prefix}_${nano()}`;
}

/** Short human-friendly case reference, e.g. SL-7K2Q-9MXA. */
export function caseReference(id: string): string {
  const core = id.split("_").pop() ?? id;
  return `SL-${core.slice(0, 4).toUpperCase()}-${core.slice(4, 8).toUpperCase()}`;
}
