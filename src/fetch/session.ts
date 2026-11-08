import { readFileSync, existsSync } from "node:fs";
import type { SessionConfig } from "../types.js";

export interface ResolvedSession {
  cookieHeader?: string;
  headers: Record<string, string>;
  storageStatePath?: string;
  storageStateJson?: unknown;
}

/**
 * Cookies (Netscape or name=value) + extra headers for HTTP/browser.
 * Куки и заголовки сессии. storageState — только для Playwright.
 */
export function resolveSession(session: SessionConfig | undefined): ResolvedSession {
  const headers = { ...(session?.headers ?? {}) };
  let cookieHeader = headers.cookie || headers.Cookie;
  delete headers.cookie;
  delete headers.Cookie;

  if (session?.cookiesFile && existsSync(session.cookiesFile)) {
    const raw = readFileSync(session.cookiesFile, "utf8");
    const fromFile = parseCookieFile(raw);
    cookieHeader = cookieHeader ? `${cookieHeader}; ${fromFile}` : fromFile;
  }

  let storageStateJson: unknown;
  let storageStatePath: string | undefined;
  if (session?.storageState && existsSync(session.storageState)) {
    storageStatePath = session.storageState;
    try {
      storageStateJson = JSON.parse(readFileSync(session.storageState, "utf8"));
    } catch {
      storageStateJson = undefined;
    }
  }

  if (cookieHeader) headers.cookie = cookieHeader;

  return {
    cookieHeader,
    headers,
    storageStatePath,
    storageStateJson,
  };
}

export function parseCookieFile(raw: string): string {
  const parts: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    // Netscape: domain flag path secure expiration name value
    const cols = t.split(/\t/);
    if (cols.length >= 7) {
      parts.push(`${cols[5]}=${cols[6]}`);
      continue;
    }
    // name=value; ...
    if (t.includes("=")) {
      const first = t.split(";")[0]!.trim();
      parts.push(first);
    }
  }
  return parts.join("; ");
}
