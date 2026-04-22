import type { Logger } from "./logger";
import { buildIntentPrompt, buildPriceExtractPrompt } from "./claude-prompts";
import {
  getMissingIntentField,
  mergeIntent,
  parseIntentDecision,
  parsePriceDecision,
  parseParamDecision,
} from "./claude-parser";
import { runPoller } from "./poller";
import { ShoppingSessionStore } from "./session-store";
import type {
  QuotedGoods,
  ShoppingIntent,
  ShoppingSession,
  WorkflowStage,
} from "../models/types";
import { Agent } from "@greaseclaw/workflow-sdk";
import { ExecutionResult, WorkflowApis } from "../api";

type ShoppingFlowDeps = {
  logger: Logger;
  agent: Agent;
  goofish: WorkflowApis;
  sessionStore?: ShoppingSessionStore;
  pollTimes?: number;
  pollIntervalMs?: number;
};

type QuotePollingResult = {
  quotes: QuotedGoods[];
  hadApiError: boolean;
};

export type ShoppingFlow = {
  handleIncoming: (params: {
    chatId: string;
    userText: string;
    params?: Record<string, unknown>;
  }) => Promise<void>;
  interrupt: (chatId: string) => void;
};

export function createShoppingFlow(params: ShoppingFlowDeps): ShoppingFlow {
  const logger = params.logger;
  const agent = params.agent;
  const goofish = params.goofish;
  const sessionStore = params.sessionStore ?? new ShoppingSessionStore();
  const pollTimes = toPositiveInt(
    params.pollTimes ?? Number(6),
    6,
  );
  const pollIntervalMs = toPositiveInt(
    params.pollIntervalMs ??
      Number(10000),
    10000,
  );

  const processingChats = new Set<string>();
  const pollControllers = new Map<string, AbortController>();

  return {
    handleIncoming: async ({ chatId, userText, params }) => {
      if (processingChats.has(chatId)) {
        pollControllers.get(chatId)?.abort();
        return await sendReply(
          chatId,
          "处理中",
          "已收到新消息，正在中断上一轮请求，请稍后再试。",
        );
      }

      processingChats.add(chatId);
      try {
        sessionStore.cleanupExpired();
        const session = sessionStore.getOrCreate(chatId);

        if (session.stage === "auth_collecting") {
          await collectCredentialAndSignin(session, userText);
        } else if (session.stage === "waiting_payment_adjust") {
          await waitForPaymentAdjust(session);
        } else {
          await executeShoppingPipeline(session, userText, chatId, params);
        }
        sessionStore.save(session);
        return;
      } finally {
        processingChats.delete(chatId);
      }
    },
    interrupt: (chatId: string) => {
      pollControllers.get(chatId)?.abort();
    },
  };

  async function executeShoppingPipeline(
    session: ShoppingSession,
    input: string,
    chatId: string,
    params?: Record<string, unknown>
  ): Promise<void> {
    transitionStage(session, "auth_checking", logger);
    await sendReply(session.chatId, "登录检查", "正在检查闲鱼登录状态");
    const loginStatus = await goofish.check_login();
    if (!loginStatus.success) {
      transitionStage(session, "failed", logger);
      return await sendReply(
        session.chatId,
        "闲鱼助手",
        loginStatus.error ?? "登录状态检查失败，请稍后再试。",
      );
    }

    const signedIn = extractLogin(loginStatus);
    if (!signedIn) {
      transitionStage(session, "auth_collecting", logger);
      session.credentialNeed = "username";
      return await sendReply(
        session.chatId,
        "登录引导",
        "检测到你尚未登录闲鱼，请先输入用户名。",
      );
    }
    await sendReply(session.chatId, "登录检查", "登录状态检查成功，已登录");

    transitionStage(session, "intent_collecting", logger);
    if (params) {
      session.intent = mergeIntent(session.intent, parseParamDecision(params!));
    } else {
      const intentRaw = await agent.complete(
        buildIntentPrompt(input, session.intent),
      );
      session.intent = mergeIntent(
        session.intent,
        parseIntentDecision(intentRaw.text),
      );
    }

    const missing = getMissingIntentField(session.intent);
    if (missing) {
      return await sendReply(
        session.chatId,
        "信息补全",
        `还缺少${toFieldLabel(missing)}，请补充该信息。`,
      );
    }

    transitionStage(session, "searching", logger);
    await sendReply(
      session.chatId,
      "商品搜索",
      `正在搜索商品「${session.intent.shop}」，请稍后...`,
    );
    const searchRes = await goofish.search(session.intent.shop);
    if (!searchRes.success) {
      transitionStage(session, "failed", logger);
      return await sendReply(
        session.chatId,
        "商品搜索失败",
        searchRes.error ?? "搜索失败，请稍后重试。",
      );
    }

    const goods = normalizeGoods(searchRes);
    if (goods.length === 0) {
      transitionStage(session, "failed", logger);
      return await sendReply(
        session.chatId,
        "商品搜索失败",
        "没有检索到可询价的商品，请调整店铺或地点后重试。",
      );
    }

    transitionStage(session, "shortlisting", logger);
    session.top = goods.slice(0, 3);
    if (session.top.length === 0) {
      transitionStage(session, "failed", logger);
      return await sendReply(
        session.chatId,
        "智能筛选失败",
        "未筛选到有效商品，请重新描述需求。",
      );
    }

    transitionStage(session, "inquiring", logger);
    await sendReply(
      session.chatId,
      "商品搜索",
      "已筛选到有效商品，正在为您询价。",
    );
    const inquiryMessage = getInquireMessage(session);

    let inquireSuccess = 0;
    for (const url of session.top) {
      const response = await goofish.inquire(getUrl(url), inquiryMessage);
      if (!response.success) {
        logger.warn(
          `[${chatId}] inquire failed: ${response.error ?? "unknown_error"}`,
        );
        continue;
      }
      inquireSuccess += 1;
    }

    if (inquireSuccess === 0) {
      transitionStage(session, "failed", logger);
      return await sendReply(
        session.chatId,
        "询价失败",
        "询价请求失败，请稍后重试。",
      );
    }

    const quoteResult = await waitForQuotedGoods(session, chatId);
    session.quotes = quoteResult.quotes;
    if (quoteResult.quotes.length === 0) {
      transitionStage(session, "failed", logger);
      if (quoteResult.hadApiError) {
        return await sendReply(
          session.chatId,
          "询价失败",
          "获取商家消息失败，请稍后重试。",
        );
      }
      return await sendReply(
        session.chatId,
        "询价结束",
        `${pollTimes}轮轮询内未收到商家报价，请稍后重试。`,
      );
    }

    await sendReply(session.chatId, "商品询价", "商品询价成功，正在为您下单。");
    const best = pickBestQuote(quoteResult.quotes);
    session.bestGoodsUrl = best.url;

    const payment = await goofish.payment(session.bestGoodsUrl);
    if (!payment.success) {
      transitionStage(session, "failed", logger);
      return await sendReply(
        session.chatId,
        "下单失败",
        payment.error ?? "支付创建失败，请稍后重试。",
      );
    }

    const qrBase64 = extractQrBase64(payment);
    if (!qrBase64) {
      transitionStage(session, "failed", logger);
      return await sendReply(
        session.chatId,
        "下单失败",
        "未获取到支付二维码，请稍后重试。",
      );
    }

    await sendReply(
      session.chatId,
      "商品下单",
      "商品下单成功，正在等待商家改价。",
    );
    session.paymentQrBase64 = qrBase64;
    session.trackingCursor = "";
    transitionStage(session, "waiting_payment_adjust", logger);
    return waitForPaymentAdjust(session);
  }

  async function collectCredentialAndSignin(
    session: ShoppingSession,
    input: string,
  ): Promise<void> {
    if (session.credentialNeed === "username") {
      session.username = input;
      session.credentialNeed = "password";
      return await sendReply(
        session.chatId,
        "登录引导",
        "已收到用户名，请输入密码。",
      );
    }

    if (session.credentialNeed === "password") {
      session.password = input;
      const signin = await goofish.login(session.username, session.password);
      if (!signin.success) {
        session.password = "";
        session.credentialNeed = "password";
        return await sendReply(
          session.chatId,
          "登录失败",
          signin.error ?? "登录失败，请重新输入密码。",
        );
      }

      session.credentialNeed = "none";
      session.username = "";
      session.password = "";
      transitionStage(session, "idle", logger);
      return await sendReply(
        session.chatId,
        "登录成功",
        "闲鱼登录成功，请重新发送购物需求。",
      );
    }

    session.credentialNeed = "username";
    return await sendReply(session.chatId, "登录引导", "请先输入用户名。");
  }

  async function waitForPaymentAdjust(session: ShoppingSession): Promise<void> {
    if (!session.bestGoodsUrl) {
      transitionStage(session, "failed", logger);
      return await sendReply(
        session.chatId,
        "订单跟踪失败",
        "缺少订单商品链接，流程已结束。",
      );
    }

    let hadApiError = false;
    const adjustMessage = await runChatPoller(
      session.chatId,
      {
        times: pollTimes,
        intervalMs: pollIntervalMs,
        shouldStop: () => session.stage !== "waiting_payment_adjust",
      },
      async () => {
        const response = await goofish.get_message(session.bestGoodsUrl);
        if (!response.success) {
          hadApiError = true;
          logger.warn(
            `[${session.chatId}] getNewMessages failed: ${response.error ?? "unknown_error"}`,
          );
        }

        const inquiryMessage = getInquireMessage(session);
        const text = extractLatestText(response, inquiryMessage);
        return isAdjustConfirmed(text) ? text : null;
      },
    );

    if (!adjustMessage) {
      transitionStage(session, "waiting_payment_adjust", logger);
      if (hadApiError) {
        return await sendReply(
          session.chatId,
          "等待改价",
          "获取商家消息失败，请稍后发送任意消息重试。",
        );
      }
      await sendReply(
        session.chatId,
        "等待改价",
        "暂未检测到改价确认消息，请稍后发送任意消息继续查询或直接识别二维码支付。",
      );
      await sendQrcode(session);
      return;
    }

    transitionStage(session, "completed", logger);
    await sendReply(session.chatId, "商品付款", "商家已改价，请识别二维码支付");
    await sendQrcode(session);
    return;
  }

  async function sendQrcode(session: ShoppingSession) {
    await agent.sendImage(session.chatId, session.paymentQrBase64);
  }

  async function waitForQuotedGoods(
    session: ShoppingSession,
    chatId: string,
  ): Promise<QuotePollingResult> {
    let hadApiError = false;
    const found = await runChatPoller(
      chatId,
      {
        times: pollTimes,
        intervalMs: pollIntervalMs,
        shouldStop: () => session.stage !== "inquiring",
      },
      async () => {
        const quotedInThisRound: QuotedGoods[] = [];
        for (const url of session.top) {
          const response = await goofish.get_message(getUrl(url));
          if (!response.success) {
            hadApiError = true;
            logger.warn(
              `[${chatId}] gfGetMessages failed: ${response.error ?? "unknown_error"}`,
            );
            continue;
          }

          const inquiryMessage = getInquireMessage(session);
          const text = extractLatestText(response, inquiryMessage);
          if (!text) continue;

          const price = await extractPrice(text);
          if (price <= 0) continue;
          logger.info(`[${chatId}] found price ${price} for goods ${url}`);

          quotedInThisRound.push({
            url: getUrl(url),
            price,
            rawMessage: text,
            replyAt: Date.now(),
          });
        }

        return quotedInThisRound.length > 0 ? quotedInThisRound : null;
      },
    );

    return {
      quotes: found ?? [],
      hadApiError,
    };
  }

  async function runChatPoller<T>(
    chatId: string,
    options: {
      times: number;
      intervalMs: number;
      shouldStop?: (index: number) => boolean;
    },
    runOnce: (index: number) => Promise<T | null>,
  ): Promise<T | null> {
    pollControllers.get(chatId)?.abort();
    const controller = new AbortController();
    pollControllers.set(chatId, controller);

    try {
      return await runPoller(
        {
          times: options.times,
          intervalMs: options.intervalMs,
          shouldStop: options.shouldStop,
          signal: controller.signal,
        },
        runOnce,
      );
    } finally {
      if (pollControllers.get(chatId) === controller) {
        pollControllers.delete(chatId);
      }
    }
  }

  function getUrl(url: string) {
    return url;
  }

  async function extractPrice(text: string): Promise<number> {
    const byAgentRaw = await agent.complete(buildPriceExtractPrompt(text));
    const byAgent = parsePriceDecision(byAgentRaw.text);
    return byAgent > 0 ? byAgent : 0;
  }

  function getInquireMessage(session: ShoppingSession): string {
    return [
      session.intent.location,
      session.intent.shop,
      session.intent.product,
      session.intent.spec,
    ]
      .filter((item) => item.length > 0)
      .join("，");
  }

  function extractLogin(response: ExecutionResult): boolean {
    if (response.success && response.task) {
      const data = JSON.parse(response.task.extract_data || "[]");
      if (Array.isArray(data) && data.length > 0) {
        return data[0].text.length > 0 && data[0].text !== "登录";
      }
    }
    return false;
  }

  function pickBestQuote(items: QuotedGoods[]): QuotedGoods {
    return [...items].sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return a.replyAt - b.replyAt;
    })[0];
  }

  function normalizeGoods(response: ExecutionResult): string[] {
    if (response.success && response.task) {
      const data = JSON.parse(response.task.extract_data || "[]");
      if (Array.isArray(data) && data.length > 0) {
        const allLinks: string[] = [];
        for (const item of data) {
          if (item.links && Array.isArray(item.links)) {
            allLinks.push(...item.links);
          }
        }
        return allLinks;
      }
    }
    return [];
  }

  function extractQrBase64(response: ExecutionResult): string {
    if (response.success && response.task) {
      const data = JSON.parse(response.task.extract_data || "[]");
      if (Array.isArray(data) && data.length > 0) {
        return data[0].links[0] ?? "";
      }
    }
    return "";
  }

  function extractLatestText(
    response: ExecutionResult,
    inquiryMessage: string,
  ): string {
    if (response.success && response.task) {
      const data = JSON.parse(response.task.extract_data || "[]");
      if (Array.isArray(data) && data.length > 0) {
        const messages: string = data[0].text;
        const index = messages.lastIndexOf(inquiryMessage);
        if (index >= 0) {
          const newMessages = messages.slice(index, messages.length);
          return newMessages;
        }
      }
    }
    return "";
  }

  function isAdjustConfirmed(text: string): boolean {
    return /(付款|已修改价格)/.test(text);
  }

  function isPickupMessage(text: string): boolean {
    return true;
  }

  function toFieldLabel(field: keyof ShoppingIntent): string {
    if (field === "location") return "地点";
    if (field === "shop") return "店铺";
    if (field === "product") return "商品";
    return "规格要求";
  }

  async function sendReply(
    chatId: string,
    title: string,
    content: string,
  ): Promise<void> {
    await agent.sendText(chatId, title, content);
  }

  function transitionStage(
    session: ShoppingSession,
    next: WorkflowStage,
    logger: Logger,
  ): void {
    if (session.stage === next) return;
    logger.info(`[${session.chatId}] stage ${session.stage} -> ${next}`);
    session.stage = next;
  }

  function toPositiveInt(value: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    const parsed = Math.floor(value);
    return parsed > 0 ? parsed : fallback;
  }
}
