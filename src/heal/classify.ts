import type { Diagnostic, FailureClass, FetchResponse, ItemCandidate } from "../types.js";

export function classifyFailure(input: {
  response?: FetchResponse;
  items: ItemCandidate[];
  configError?: string;
  validationFailed?: boolean;
  discoveryExhausted?: boolean;
}): { failureClass: FailureClass; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];

  if (input.configError) {
    return {
      failureClass: "invalid_target_config",
      diagnostics: [
        { level: "error", code: "invalid_target_config", message: input.configError },
      ],
    };
  }

  if (input.validationFailed) {
    return {
      failureClass: "validation_failed",
      diagnostics: [
        { level: "error", code: "validation_failed", message: "Canary rejected extract" },
      ],
    };
  }

  if (input.discoveryExhausted) {
    return {
      failureClass: "discovery_exhausted",
      diagnostics: [
        {
          level: "error",
          code: "discovery_exhausted",
          message: "Discovery budget exhausted without a viable page",
        },
      ],
    };
  }

  const res = input.response;
  if (res) {
    if (res.headers?.["x-adaparse-robots"] === "blocked") {
      return {
        failureClass: "robots_blocked",
        diagnostics: [
          { level: "error", code: "robots_blocked", message: "Blocked by robots.txt" },
        ],
      };
    }
    if (res.status === 403 || res.status === 429) {
      return {
        failureClass: "fetch_blocked",
        diagnostics: [
          {
            level: "error",
            code: "fetch_blocked",
            message: `HTTP ${res.status}`,
            details: { status: res.status },
          },
        ],
      };
    }
    if (res.status === 404) {
      return {
        failureClass: "content_moved",
        diagnostics: [
          { level: "error", code: "http_404", message: "Entry URL returned 404" },
        ],
      };
    }
    if (looksSoft404(res.body)) {
      return {
        failureClass: "soft_404",
        diagnostics: [
          {
            level: "error",
            code: "soft_404",
            message: "Page looks like a soft 404 / empty shell",
          },
        ],
      };
    }
    if (looksAntibot(res.body)) {
      return {
        failureClass: "antibot_suspected",
        diagnostics: [
          {
            level: "error",
            code: "antibot_suspected",
            message: "Response resembles an antibot challenge page",
          },
        ],
      };
    }
  }

  if (!input.items.length) {
    diagnostics.push({
      level: "error",
      code: "empty_result",
      message: "No items extracted",
    });
    // Prefer selector_drift when we previously had structure; caller may override
    return { failureClass: "empty_result", diagnostics };
  }

  return {
    failureClass: "selector_drift",
    diagnostics: [
      {
        level: "warn",
        code: "selector_drift",
        message: "Extract quality dropped; likely selector/layout drift",
      },
    ],
  };
}

export function looksSoft404(html: string): boolean {
  const t = html.toLowerCase();
  if (html.length < 400) return true;
  return (
    /page not found|not found|doesn't exist|does not exist|404|no longer available/.test(t) &&
    !/\$\d|\d+[.,]\d{2}|product/.test(t)
  );
}

function looksAntibot(html: string): boolean {
  return /cf-browser-verification|attention required|captcha|access denied|bot detection/i.test(
    html,
  );
}
