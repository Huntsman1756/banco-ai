import { createHash } from "node:crypto";

export type RobotRule = {
  disallow: string[];
  userAgent: string;
  crawlDelayMs?: number;
  fetchedAt: string;
};

const robotCache = new Map<string, RobotRule>();

function parseDisallowLines(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith("disallow"))
    .map((line) => line.split(":")[1])
    .map((value) => (value ? value.trim() : ""))
    .filter(Boolean);
}

function parseRobotsTxt(raw: string): Omit<RobotRule, "fetchedAt"> {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const disallow = parseDisallowLines(lines);
  const crawlDelayLine = lines.find((line) => line.toLowerCase().startsWith("crawl-delay"));
  const crawlDelayMs = crawlDelayLine
    ? Number.parseInt(crawlDelayLine.split(":")[1]?.trim() ?? "0", 10) * 1000
    : undefined;
  const userAgent = lines.find((line) => line.toLowerCase().startsWith("user-agent"))
    ? "identified"
    : "default";

  return {
    userAgent,
    disallow,
    crawlDelayMs: Number.isFinite(crawlDelayMs ?? NaN) ? crawlDelayMs : undefined,
  };
}

export async function getRobotsRuleForUrl(rawUrl: string): Promise<RobotRule> {
  const parsedUrl = new URL(rawUrl);
  const domainKey = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
  const cached = robotCache.get(domainKey);
  if (cached) {
    const cacheAgeMs = Date.now() - new Date(cached.fetchedAt).getTime();
    if (cacheAgeMs < 24 * 60 * 60 * 1000) {
      return cached;
    }
  }

  const robotsUrl = `${domainKey}/robots.txt`;
  const response = await fetch(robotsUrl);
  const text = response.ok ? await response.text() : "";
  const parsedRobots = parseRobotsTxt(text);
  const next: RobotRule = {
    ...parsedRobots,
    fetchedAt: new Date().toISOString(),
  };
  robotCache.set(domainKey, next);
  return next;
}

export function isPathAllowedByRobots(rawUrl: string, rule: RobotRule): boolean {
  const path = new URL(rawUrl).pathname || "/";
  for (const disallow of rule.disallow) {
    const normalized = disallow === "/" ? "/" : disallow.replace(/\*+$/g, "");
    if (!normalized) {
      continue;
    }
    if (path.startsWith(normalized)) {
      return false;
    }
  }
  return true;
}

export function stableHash(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}
