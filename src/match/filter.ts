import type { FieldConfig, ItemCandidate } from "../types.js";

const JUNK_TITLE =
  /^(home|about|contact|cart|checkout|login|register|privacy|terms|cookie|menu|search)$/i;

export function filterItems(
  items: ItemCandidate[],
  fields: FieldConfig[],
): ItemCandidate[] {
  const required = fields.filter((f) => f.required).map((f) => f.name);

  return items
    .filter((item) => {
      for (const name of required) {
        if (item.fields[name] == null) return false;
      }
      const title = item.fields.title?.value;
      if (typeof title === "string" && JUNK_TITLE.test(title.trim())) return false;
      return true;
    })
    .map((item) => projectFields(item, fields));
}

function projectFields(item: ItemCandidate, fields: FieldConfig[]): ItemCandidate {
  const allowed = new Set(fields.map((f) => f.name));
  const fieldsOut: ItemCandidate["fields"] = {};
  for (const [k, v] of Object.entries(item.fields)) {
    if (allowed.has(k)) fieldsOut[k] = v;
  }
  return { ...item, fields: fieldsOut };
}

export function itemsToPlain(items: ItemCandidate[]): Record<string, unknown>[] {
  return items.map((item) => {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item.fields)) {
      row[k] = v.value;
    }
    return row;
  });
}
