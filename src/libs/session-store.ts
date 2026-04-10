import type { ShoppingSession } from "../models/types";

const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_MAX_SIZE = Number(500);

const defaultIntent = {
  location: "",
  shop: "",
  product: "",
  spec: "",
};

export class ShoppingSessionStore {
  private readonly sessions = new Map<string, ShoppingSession>();

  size(): number {
    return this.sessions.size;
  }

  getOrCreate(chatId: string): ShoppingSession {
    const now = Date.now();
    const existing = this.sessions.get(chatId);
    if (existing) {
      existing.lastUpdatedAt = now;
      return existing;
    }

    this.evictIfNeeded();

    const created: ShoppingSession = {
      chatId,
      stage: "idle",
      credentialNeed: "none",
      username: "",
      password: "",
      intent: { ...defaultIntent },
      top: [],
      quotes: [],
      bestGoodsUrl: "",
      bestGoodsText: "",
      paymentQrBase64: "",
      trackingCursor: "",
      lastUpdatedAt: now,
    };
    this.sessions.set(chatId, created);
    return created;
  }

  save(session: ShoppingSession): void {
    session.lastUpdatedAt = Date.now();
    this.sessions.set(session.chatId, session);
  }

  clear(chatId: string): void {
    this.sessions.delete(chatId);
  }

  cleanupExpired(ttlMs: number = SESSION_TTL_MS): void {
    const now = Date.now();
    for (const [chatId, session] of this.sessions.entries()) {
      if (now - session.lastUpdatedAt > ttlMs) {
        this.sessions.delete(chatId);
      }
    }
  }

  private evictIfNeeded(): void {
    const safeMax = Number.isFinite(SESSION_MAX_SIZE) && SESSION_MAX_SIZE > 0 ? SESSION_MAX_SIZE : 500;
    if (this.sessions.size < safeMax) return;

    let oldestChatId = "";
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [chatId, session] of this.sessions.entries()) {
      if (session.lastUpdatedAt < oldestTime) {
        oldestTime = session.lastUpdatedAt;
        oldestChatId = chatId;
      }
    }

    if (oldestChatId) {
      this.sessions.delete(oldestChatId);
    }
  }
}
