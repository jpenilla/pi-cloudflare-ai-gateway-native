import type { ProviderResponse } from "@earendil-works/pi-ai";
import { DIAGNOSTICS_ENV } from "./config.js";

const SAFE_RESPONSE_HEADERS = new Set(["cf-ray", "content-type", "request-id", "retry-after", "x-request-id"]);

export function diagnosticsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DIAGNOSTICS_ENV] === "1";
}

export function redactGatewayUrl(value: string): string {
  const url = new URL(value);
  const segments = url.pathname.split("/");
  if (segments[1] === "v1" && segments.length >= 5) segments[2] = "<redacted-account>";
  const accountsIndex = segments.indexOf("accounts");
  if (accountsIndex >= 0 && segments[accountsIndex + 1]) segments[accountsIndex + 1] = "<redacted-account>";
  return `${url.origin}${segments.join("/")}`;
}

export function safeResponseHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => SAFE_RESPONSE_HEADERS.has(name.toLowerCase())),
  );
}

export function logDiagnostic(event: Record<string, unknown>): void {
  console.error(`[cloudflare-ai-gateway-native] ${JSON.stringify(event)}`);
}

export function responseDiagnostic(response: ProviderResponse): Record<string, unknown> {
  return {
    event: "response",
    status: response.status,
    headers: safeResponseHeaders(response.headers),
  };
}
