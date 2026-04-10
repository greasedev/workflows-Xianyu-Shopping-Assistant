import type { ShoppingIntent } from "../models/types";

export function buildIntentPrompt(userText: string, currentIntent: ShoppingIntent): string {
  return [
    "你是购物请求解析器。",
    "请从用户输入中提取四要素：location、shop、product、spec。",
    "仅输出 JSON，不要输出其他文本。",
    "若某字段未知，输出空字符串。",
    `当前已知要素: ${JSON.stringify(currentIntent)}`,
    `用户输入: ${userText}`,
    '输出示例: {"location":"","shop":"","product":"","spec":""}',
  ].join("\n");
}

// export function buildTop3Prompt(intent: ShoppingIntent, goodsList: GoodsCandidate[]): string {
//   return [
//     "你是商品匹配器。",
//     "给定购物四要素和候选商品，请选最匹配的3个。",
//     "优先输出 indexes 数组（候选下标，从0开始）。",
//     "也可输出 urls 数组（候选链接）。",
//     "仅输出 JSON。",
//     `购物四要素: ${JSON.stringify(intent)}`,
//     `候选商品: ${JSON.stringify(goodsList)}`,
//     '输出示例: {"indexes":[0,2,3],"urls":[]}',
//   ].join("\n");
// }

export function buildPriceExtractPrompt(message: string): string {
  return [
    "你是价格抽取器。",
    "从输入消息中提取价格数值，单位元。",
    "如果没有价格，输出 price 为 0。",
    "仅输出 JSON。",
    `消息: ${message}`,
    '输出示例: {"price":23.5}',
  ].join("\n");
}
