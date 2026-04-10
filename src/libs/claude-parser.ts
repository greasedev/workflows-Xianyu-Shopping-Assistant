import type { ClaudeIntentDecision, ClaudeTop3Decision, ShoppingIntent } from "../models/types";

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1).trim();
  }
  return "{}";
}

function safeParseObject(input: string): Record<string, unknown> {
  try {
    const raw = extractJsonObject(input);
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function toStringValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function parseIntentDecision(input: string): ClaudeIntentDecision {
  const obj = safeParseObject(input);
  return {
    location: toStringValue(obj.location),
    shop: toStringValue(obj.shop),
    product: toStringValue(obj.product),
    spec: toStringValue(obj.spec),
  };
}

export function mergeIntent(current: ShoppingIntent, patch: ClaudeIntentDecision): ShoppingIntent {
  return {
    location: patch.location || current.location,
    shop: patch.shop || current.shop,
    product: patch.product || current.product,
    spec: patch.spec || current.spec,
  };
}

export function getMissingIntentField(intent: ShoppingIntent): keyof ShoppingIntent | "" {
  if (!intent.location) return "location";
  if (!intent.shop) return "shop";
  if (!intent.product) return "product";
  if (!intent.spec) return "spec";
  return "";
}

export function parseTop3Decision(input: string): ClaudeTop3Decision {
  const obj = safeParseObject(input);
  const indexes = Array.isArray(obj.indexes)
    ? obj.indexes.filter((v): v is number => Number.isInteger(v))
    : [];
  const urls = Array.isArray(obj.urls)
    ? obj.urls.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
  return { indexes, urls };
}

export function extractPriceByRule(text: string): number {
  const matched = text.match(/(\d+(?:\.\d{1,2})?)/g);
  if (!matched || matched.length === 0) return 0;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parsePriceDecision(input: string): number {
  const obj = safeParseObject(input);
  const value = typeof obj.price === "number" ? obj.price : Number(obj.price ?? 0);
  if (!Number.isFinite(value)) return 0;
  return value > 0 ? value : 0;
}

export function parseParamDecision(params: Record<string, unknown>): ClaudeIntentDecision {
  const location = [
    toStringValue(params.city),
    toStringValue(params.area),
  ].filter(Boolean).join("");

  return {
    location,
    shop: toStringValue(params.shop),
    product: toStringValue(params.product),
    spec: toStringValue(params.specification),
  };
}
