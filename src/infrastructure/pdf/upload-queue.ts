import { randomUUID } from "node:crypto";
import { evaluatePdfUpload, type PdfGuardInput } from "../../domain/pdf-guard";

type UploadRequest = {
  id: string;
  createdAt: string;
  createdAtMs: number;
  input: PdfGuardInput;
  userId?: string;
  action: "allow_llm_processing" | "queue_review_only" | "reject_upload";
  guardReasons: string[];
};

type LimitConfig = {
  globalQueueMax: number;
  perUserQueueMax: number;
  perUserBurstLimit: number;
  maxQueueAgeMs: number;
};

type LimitCounter = {
  lastMinute: number;
  minuteCount: number;
  totalQueued: number;
};

type PdfQueueSnapshot = {
  totalQueued: number;
  totalReviewOnlyQueued: number;
  totalDirectLLMQueued: number;
  oldestQueuedAt?: string;
  newestQueuedAt?: string;
  requestIds: string[];
};

const DEFAULT_LIMITS: LimitConfig = {
  globalQueueMax: 40,
  perUserQueueMax: 5,
  perUserBurstLimit: 20,
  maxQueueAgeMs: 60 * 60 * 1000,
};

const minuteBucketMs = 60 * 1000;
const userCounters = new Map<string, LimitCounter>();
const uploadQueue: UploadRequest[] = [];

function nowMinute(ts: number): number {
  return Math.floor(ts / minuteBucketMs);
}

function purgeExpiredRequests(cfg: LimitConfig, now: number): void {
  const minCreatedAt = now - cfg.maxQueueAgeMs;
  while (uploadQueue.length > 0 && uploadQueue[0].createdAtMs < minCreatedAt) {
    const evicted = uploadQueue.shift();
    if (!evicted) {
      break;
    }

    const counter = userCounters.get(evicted.userId ?? "anonymous");
    if (!counter) {
      continue;
    }
    counter.totalQueued = Math.max(0, counter.totalQueued - 1);
  }
}

function canAcceptForUser(userId: string, cfg: LimitConfig, now: number): boolean {
  const minute = nowMinute(now);
  const existing = userCounters.get(userId) ?? { lastMinute: minute, minuteCount: 0, totalQueued: 0 };

  if (existing.lastMinute !== minute) {
    existing.lastMinute = minute;
    existing.minuteCount = 0;
  }
  if (existing.totalQueued >= cfg.perUserBurstLimit) {
    return false;
  }
  if (existing.minuteCount >= cfg.perUserQueueMax) {
    return false;
  }

  existing.minuteCount += 1;
  existing.totalQueued += 1;
  userCounters.set(userId, existing);
  return true;
}

export type EnqueueDecision = {
  accepted: boolean;
  reason: string;
  requestId?: string;
  queuePosition?: number;
  estimatedManualReview: boolean;
};

export function queuePdfForProcessing(
  input: PdfGuardInput,
  options?: { userId?: string; config?: Partial<LimitConfig> },
): EnqueueDecision {
  const cfg = { ...DEFAULT_LIMITS, ...(options?.config ?? {}) };
  const now = Date.now();
  purgeExpiredRequests(cfg, now);
  const guard = evaluatePdfUpload(input);
  if (guard.action === "reject_upload") {
    return {
      accepted: false,
      reason: guard.reasons.join(" | "),
      estimatedManualReview: false,
    };
  }

  if (uploadQueue.length >= cfg.globalQueueMax) {
    return {
      accepted: false,
      reason: "Global PDF queue saturated. Retry later.",
      estimatedManualReview: false,
    };
  }

  const userId = options?.userId ?? "anonymous";
  if (!canAcceptForUser(userId, cfg, now)) {
    return {
      accepted: false,
      reason: "User PDF burst limit reached. Retry in one minute.",
      estimatedManualReview: false,
    };
  }

  const request: UploadRequest = {
    id: randomUUID(),
    createdAt: new Date(now).toISOString(),
    createdAtMs: now,
    input,
    userId: options?.userId,
    action: guard.action,
    guardReasons: [...guard.reasons],
  };
  uploadQueue.push(request);
  return {
    accepted: true,
    reason: guard.reasons.join(" | "),
    requestId: request.id,
    queuePosition: uploadQueue.length,
    estimatedManualReview: request.action === "queue_review_only",
  };
}

function buildQueueSnapshot(): PdfQueueSnapshot {
  return {
    totalQueued: uploadQueue.length,
    totalReviewOnlyQueued: uploadQueue.filter((item) => item.action === "queue_review_only").length,
    totalDirectLLMQueued: uploadQueue.filter((item) => item.action === "allow_llm_processing").length,
    oldestQueuedAt: uploadQueue[0]?.createdAt,
    newestQueuedAt: uploadQueue[uploadQueue.length - 1]?.createdAt,
    requestIds: uploadQueue.map((item) => item.id),
  };
}

export function getPdfQueueSnapshot(): PdfQueueSnapshot {
  return buildQueueSnapshot();
}

export function dequeueNextPdf(): UploadRequest | undefined {
  const next = uploadQueue.shift();
  if (!next) {
    return undefined;
  }

  const userId = next.userId ?? "anonymous";
  const counter = userCounters.get(userId);
  if (counter) {
    counter.totalQueued = Math.max(0, counter.totalQueued - 1);
  }
  return next;
}

export function peekNextPdf(): UploadRequest | undefined {
  return uploadQueue[0];
}
