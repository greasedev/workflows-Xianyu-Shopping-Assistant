export type WorkflowStage =
  | "idle"
  | "auth_checking"
  | "auth_collecting"
  | "intent_collecting"
  | "searching"
  | "shortlisting"
  | "inquiring"
  | "waiting_payment_adjust"
  | "completed"
  | "failed";

export type CredentialNeed = "username" | "password" | "none";

export type ShoppingIntent = {
  location: string;
  shop: string;
  product: string;
  spec: string;
};

export type QuotedGoods = {
  url: string;
  price: number;
  rawMessage: string;
  replyAt: number;
};

export type ShoppingSession = {
  chatId: string;
  stage: WorkflowStage;
  credentialNeed: CredentialNeed;
  username: string;
  password: string;
  intent: ShoppingIntent;
  top: string[];
  quotes: QuotedGoods[];
  bestGoodsUrl: string;
  bestGoodsText: string;
  paymentQrBase64: string;
  trackingCursor: string;
  lastUpdatedAt: number;
};

export type ClaudeIntentDecision = {
  location?: string;
  shop?: string;
  product?: string;
  spec?: string;
};

export type ClaudeTop3Decision = {
  indexes?: number[];
  urls?: string[];
};
