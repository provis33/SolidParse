import type { FieldConfig, TargetPreset } from "../types.js";

export interface PresetDefinition {
  preset: TargetPreset;
  defaultFields: FieldConfig[];
  requiredSignals: string[];
  healProfile: {
    preferList: boolean;
    minItems: number;
    maxItemsSoft: number;
  };
}

const productFields: FieldConfig[] = [
  { name: "title", required: true, normalize: "string" },
  { name: "price", required: true, normalize: "money" },
  { name: "url", required: true, normalize: "url" },
  { name: "image", required: false, normalize: "image" },
  { name: "currency", required: false, normalize: "string" },
  { name: "availability", required: false, normalize: "string" },
];

export const PRESETS: Record<TargetPreset, PresetDefinition> = {
  product_list: {
    preset: "product_list",
    defaultFields: productFields,
    requiredSignals: ["title", "price", "list_cards"],
    healProfile: { preferList: true, minItems: 1, maxItemsSoft: 200 },
  },
  product_detail: {
    preset: "product_detail",
    defaultFields: [
      { name: "title", required: true, normalize: "string" },
      { name: "price", required: true, normalize: "money" },
      { name: "currency", required: false, normalize: "string" },
      { name: "availability", required: false, normalize: "string" },
      { name: "sku", required: false, normalize: "string" },
      { name: "description", required: false, normalize: "string" },
    ],
    requiredSignals: ["title", "price"],
    healProfile: { preferList: false, minItems: 1, maxItemsSoft: 1 },
  },
  price_only: {
    preset: "price_only",
    defaultFields: [
      { name: "price", required: true, normalize: "money" },
      { name: "currency", required: false, normalize: "string" },
      { name: "label", required: false, normalize: "string" },
    ],
    requiredSignals: ["price"],
    healProfile: { preferList: false, minItems: 1, maxItemsSoft: 5 },
  },
  availability: {
    preset: "availability",
    defaultFields: [
      { name: "availability", required: true, normalize: "string" },
      { name: "title", required: false, normalize: "string" },
    ],
    requiredSignals: ["availability"],
    healProfile: { preferList: false, minItems: 1, maxItemsSoft: 1 },
  },
  article_list: {
    preset: "article_list",
    defaultFields: [
      { name: "title", required: true, normalize: "string" },
      { name: "url", required: true, normalize: "url" },
      { name: "date", required: false, normalize: "string" },
      { name: "excerpt", required: false, normalize: "string" },
    ],
    requiredSignals: ["title", "list_cards"],
    healProfile: { preferList: true, minItems: 1, maxItemsSoft: 100 },
  },
  custom: {
    preset: "custom",
    defaultFields: [],
    requiredSignals: [],
    healProfile: { preferList: true, minItems: 1, maxItemsSoft: 100 },
  },
};

export function resolveFields(
  preset: TargetPreset,
  fields?: FieldConfig[],
): FieldConfig[] {
  if (fields && fields.length > 0) return fields;
  return PRESETS[preset].defaultFields;
}
