import type { ApiKeyAuth, ApiKeyCredential, AuthContext, ProviderHeaders } from "@earendil-works/pi-ai";
import { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY, CLOUDFLARE_GATEWAY_ID } from "./config.js";

const FORBIDDEN_UPSTREAM_HEADERS = new Set(["authorization", "x-api-key", "x-goog-api-key"]);
const ACCOUNT_REST_CONTROLLED_HEADERS = new Set([
  ...FORBIDDEN_UPSTREAM_HEADERS,
  "cf-aig-authorization",
  "cf-aig-gateway-id",
]);

function valueFromCredential(credential: ApiKeyCredential | undefined, name: string): string | undefined {
  return name === CLOUDFLARE_API_KEY ? credential?.key : credential?.env?.[name];
}

async function resolveValue(
  ctx: AuthContext,
  credential: ApiKeyCredential | undefined,
  name: string,
): Promise<string | undefined> {
  const value = valueFromCredential(credential, name) ?? (await ctx.env(name));
  const normalized = value?.trim();
  return normalized || undefined;
}

/**
 * Apply Cloudflare gateway auth after all caller/provider headers are merged.
 * Header names are compared case-insensitively to prevent duplicate leakage.
 */
export function hardenGatewayHeaders(headers: ProviderHeaders | undefined, token?: string): ProviderHeaders {
  const hardened: ProviderHeaders = {};
  let gatewayAuthorization = token ? `Bearer ${token}` : undefined;

  for (const [name, value] of Object.entries(headers ?? {})) {
    const normalized = name.toLowerCase();
    if (normalized === "cf-aig-authorization") {
      if (!gatewayAuthorization && value) gatewayAuthorization = value;
      continue;
    }
    if (!FORBIDDEN_UPSTREAM_HEADERS.has(normalized)) hardened[name] = value;
  }

  // Null tombstones suppress SDK/provider defaults as well as deleting supplied values.
  hardened.Authorization = null;
  hardened["x-api-key"] = null;
  hardened["x-goog-api-key"] = null;
  if (gatewayAuthorization) hardened["cf-aig-authorization"] = gatewayAuthorization;
  return hardened;
}

/**
 * Harden account REST headers. The OpenAI SDK derives Cloudflare's
 * Authorization header from options.apiKey; caller-supplied auth is removed.
 */
export function hardenAccountRestHeaders(
  headers: ProviderHeaders | undefined,
  gatewayId: string,
): ProviderHeaders {
  const hardened: ProviderHeaders = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!ACCOUNT_REST_CONTROLLED_HEADERS.has(name.toLowerCase())) hardened[name] = value;
  }
  hardened["x-api-key"] = null;
  hardened["x-goog-api-key"] = null;
  hardened["cf-aig-gateway-id"] = gatewayId;
  return hardened;
}

/**
 * @google/genai requires a truthy SDK apiKey but honors an explicitly present
 * empty key header. This sentinel prevents the SDK from re-emitting the
 * Cloudflare token as x-goog-api-key while cf-aig-authorization authenticates.
 */
export function hardenGoogleGatewayHeaders(headers: ProviderHeaders | undefined): ProviderHeaders {
  return { ...hardenGatewayHeaders(headers), "x-goog-api-key": "" };
}

export function cloudflareGatewayNativeAuth(): ApiKeyAuth {
  return {
    name: "Cloudflare AI Gateway token and route",
    async login(interaction) {
      const key = await interaction.prompt({ type: "secret", message: "Enter Cloudflare AI Gateway token" });
      const accountId = await interaction.prompt({ type: "text", message: "Enter Cloudflare account ID" });
      const gatewayId = await interaction.prompt({ type: "text", message: "Enter Cloudflare AI Gateway ID" });
      return {
        type: "api_key",
        key: key.trim(),
        env: {
          [CLOUDFLARE_ACCOUNT_ID]: accountId.trim(),
          [CLOUDFLARE_GATEWAY_ID]: gatewayId.trim(),
        },
      };
    },
    async resolve({ ctx, credential }) {
      const [token, accountId, gatewayId] = await Promise.all([
        resolveValue(ctx, credential, CLOUDFLARE_API_KEY),
        resolveValue(ctx, credential, CLOUDFLARE_ACCOUNT_ID),
        resolveValue(ctx, credential, CLOUDFLARE_GATEWAY_ID),
      ]);
      if (!token || !accountId || !gatewayId) return undefined;

      return {
        auth: { apiKey: token, headers: hardenGatewayHeaders(undefined, token) },
        env: {
          [CLOUDFLARE_ACCOUNT_ID]: accountId,
          [CLOUDFLARE_GATEWAY_ID]: gatewayId,
        },
        source: credential ? "stored credential" : CLOUDFLARE_API_KEY,
      };
    },
  };
}
