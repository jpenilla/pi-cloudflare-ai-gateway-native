import type { Api, Model, ProviderEnv } from "@earendil-works/pi-ai";

export const PROVIDER_ID = "cloudflare-ai-gateway-native";
export const OPENAI_SOURCE_PROVIDER_ID = "openai";
export const ANTHROPIC_SOURCE_PROVIDER_ID = "anthropic";
export const DEEPSEEK_SOURCE_PROVIDER_ID = "deepseek";
export const GOOGLE_SOURCE_PROVIDER_ID = "google";
export const XAI_SOURCE_PROVIDER_ID = "xai";
export const WORKERS_AI_SOURCE_PROVIDER_ID = "cloudflare-workers-ai";
export const OPENAI_GATEWAY_ROUTE = "openai";
export const ANTHROPIC_GATEWAY_ROUTE = "anthropic";
export const GOOGLE_GATEWAY_ROUTE = "google-ai-studio/v1beta";
export const XAI_GATEWAY_ROUTE = "grok/v1";
export const ACCOUNT_REST_API_PATH = "ai/v1";

export const CLOUDFLARE_API_KEY = "CLOUDFLARE_API_KEY";
export const CLOUDFLARE_ACCOUNT_ID = "CLOUDFLARE_ACCOUNT_ID";
export const CLOUDFLARE_GATEWAY_ID = "CLOUDFLARE_GATEWAY_ID";
export const DIAGNOSTICS_ENV = "CLOUDFLARE_AIG_NATIVE_DIAGNOSTICS";

function requiredPathComponent(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return encodeURIComponent(normalized);
}

export function gatewayBaseUrlTemplate(gatewayRoute: string): string {
  return `https://gateway.ai.cloudflare.com/v1/{${CLOUDFLARE_ACCOUNT_ID}}/{${CLOUDFLARE_GATEWAY_ID}}/${gatewayRoute}`;
}

export function buildGatewayBaseUrl(accountId: string, gatewayId: string, gatewayRoute: string): string {
  return `https://gateway.ai.cloudflare.com/v1/${requiredPathComponent(accountId, CLOUDFLARE_ACCOUNT_ID)}/${requiredPathComponent(gatewayId, CLOUDFLARE_GATEWAY_ID)}/${gatewayRoute}`;
}

export function accountRestBaseUrlTemplate(): string {
  return `https://api.cloudflare.com/client/v4/accounts/{${CLOUDFLARE_ACCOUNT_ID}}/${ACCOUNT_REST_API_PATH}`;
}

export function buildAccountRestBaseUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${requiredPathComponent(accountId, CLOUDFLARE_ACCOUNT_ID)}/${ACCOUNT_REST_API_PATH}`;
}

export function materializeGatewayModel<TApi extends Api, TModel extends Model<TApi>>(
  model: TModel,
  env: ProviderEnv | undefined,
  gatewayRoute: string,
): TModel {
  const baseUrl = buildGatewayBaseUrl(
    env?.[CLOUDFLARE_ACCOUNT_ID] ?? "",
    env?.[CLOUDFLARE_GATEWAY_ID] ?? "",
    gatewayRoute,
  );
  return { ...model, baseUrl };
}

export function materializeAccountRestModel<TApi extends Api, TModel extends Model<TApi>>(
  model: TModel,
  env: ProviderEnv | undefined,
): TModel {
  return {
    ...model,
    baseUrl: buildAccountRestBaseUrl(env?.[CLOUDFLARE_ACCOUNT_ID] ?? ""),
  };
}
