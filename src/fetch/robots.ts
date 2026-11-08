import type { Fetcher } from "../types.js";

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelayMs: number;
  fetched: boolean;
}

const cache = new Map<string, RobotsRules>();

export function clearRobotsCache(): void {
  cache.clear();
}

export async function loadRobots(
  fetcher: Fetcher,
  origin: string,
  userAgent = "adaparse",
): Promise<RobotsRules> {
  const key = origin;
  if (cache.has(key)) return cache.get(key)!;

  const url = new URL("/robots.txt", origin).toString();
  try {
    const res = await fetcher.fetch(url);
    if (res.status !== 200) {
      const empty: RobotsRules = { allow: [], disallow: [], crawlDelayMs: 0, fetched: false };
      cache.set(key, empty);
      return empty;
    }
    const rules = parseRobots(res.body, userAgent);
    cache.set(key, rules);
    return rules;
  } catch {
    const empty: RobotsRules = { allow: [], disallow: [], crawlDelayMs: 0, fetched: false };
    cache.set(key, empty);
    return empty;
  }
}

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  let inGroup = false;
  let bestGroup: { allow: string[]; disallow: string[]; crawlDelayMs: number } | null = null;
  let starGroup: { allow: string[]; disallow: string[]; crawlDelayMs: number } | null = null;
  let current = { allow: [] as string[], disallow: [] as string[], crawlDelayMs: 0 };
  let agents: string[] = [];

  const flush = () => {
    if (!agents.length) return;
    const g = { ...current, allow: [...current.allow], disallow: [...current.disallow] };
    if (agents.some((a) => a === "*" )) starGroup = g;
    if (agents.some((a) => userAgent.toLowerCase().includes(a) || a.includes("adaparse"))) {
      bestGroup = g;
    }
    current = { allow: [], disallow: [], crawlDelayMs: 0 };
    agents = [];
    inGroup = false;
  };

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      flush();
      continue;
    }
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === "user-agent") {
      if (inGroup && current.allow.length + current.disallow.length > 0) flush();
      agents.push(val.toLowerCase());
      inGroup = true;
    } else if (key === "disallow" && inGroup) {
      if (val) current.disallow.push(val);
    } else if (key === "allow" && inGroup) {
      if (val) current.allow.push(val);
    } else if (key === "crawl-delay" && inGroup) {
      const sec = Number(val);
      if (Number.isFinite(sec) && sec > 0) current.crawlDelayMs = Math.round(sec * 1000);
    }
  }
  flush();

  const chosen = bestGroup ?? starGroup ?? { allow: [], disallow: [], crawlDelayMs: 0 };
  return { ...chosen, fetched: true };
}

export function isAllowed(rules: RobotsRules, url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname || "/";
  } catch {
    return true;
  }

  let bestAllow = -1;
  let bestDisallow = -1;
  for (const a of rules.allow) {
    if (pathMatches(path, a)) bestAllow = Math.max(bestAllow, a.length);
  }
  for (const d of rules.disallow) {
    if (d === "") continue;
    if (pathMatches(path, d)) bestDisallow = Math.max(bestDisallow, d.length);
  }
  if (bestDisallow < 0) return true;
  if (bestAllow > bestDisallow) return true;
  return false;
}

function pathMatches(path: string, rule: string): boolean {
  if (rule === "/") return true;
  // simple prefix match; treat * as wildcard
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}`).test(path);
}
