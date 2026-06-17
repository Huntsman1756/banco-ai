import { getRobotsRuleForUrl, isPathAllowedByRobots, stableHash } from "./robots";

export type ScrapeHttpResult = {
  url: string;
  ok: boolean;
  status: number;
  text: string;
  error?: string;
  elapsedMs: number;
  requestFingerprint: string;
};

const USER_AGENT = "BancoAI/1.3 (+project-banco-ai; information-only comparison)";
const FETCH_TIMEOUT_MS = 30_000;
const FALLBACK_CRAWL_DELAY_MS = 5_000;

type DomainThrottleState = {
  lastFetch: number;
  minDelayMs: number;
};

const domainThrottle = new Map<string, DomainThrottleState>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDomainRateLimit(url: string): Promise<void> {
  const parsed = new URL(url);
  const key = parsed.hostname;
  const robots = await getRobotsRuleForUrl(url);
  const resolvedDelay = Math.max(FALLBACK_CRAWL_DELAY_MS, robots.crawlDelayMs ?? FALLBACK_CRAWL_DELAY_MS);
  const state = domainThrottle.get(key) ?? { lastFetch: 0, minDelayMs: resolvedDelay };
  state.minDelayMs = Math.max(state.minDelayMs, resolvedDelay);
  const last = state.lastFetch;
  const now = Date.now();
  const minDelay = state.minDelayMs;
  const wait = now - last < minDelay ? minDelay - (now - last) : 0;
  if (wait > 0) {
    await sleep(wait);
  }
  state.lastFetch = Date.now();
  domainThrottle.set(key, state);
}

function cleanHtml(raw: string): string {
  return raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchSourcePageText(url: string): Promise<ScrapeHttpResult> {
  const start = Date.now();
  try {
    await waitForDomainRateLimit(url);

    const robots = await getRobotsRuleForUrl(url);
    if (!isPathAllowedByRobots(url, robots)) {
      return {
        url,
        ok: false,
        status: 403,
        text: "",
        error: "blocked by robots.txt",
        elapsedMs: Date.now() - start,
        requestFingerprint: stableHash(url + Date.now()),
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    const status = response.status;
    if (!response.ok) {
      return {
        url,
        ok: false,
        status,
        text: "",
        error: `HTTP ${status}`,
        elapsedMs: Date.now() - start,
        requestFingerprint: stableHash(url + status + Date.now()),
      };
    }

    const raw = await response.text();
    return {
      url,
      ok: true,
      status,
      text: cleanHtml(raw).toLowerCase(),
      elapsedMs: Date.now() - start,
      requestFingerprint: stableHash(url + raw.slice(0, 400)),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      text: "",
      error: (error as Error).message,
      elapsedMs: Date.now() - start,
      requestFingerprint: stableHash(url + (error as Error).message),
    };
  }
}
