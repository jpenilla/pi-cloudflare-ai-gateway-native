import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  ANTHROPIC_SOURCE_PROVIDER_ID,
  DEEPSEEK_SOURCE_PROVIDER_ID,
  GOOGLE_SOURCE_PROVIDER_ID,
  OPENAI_SOURCE_PROVIDER_ID,
  PROVIDER_ID,
  WORKERS_AI_SOURCE_PROVIDER_ID,
  XAI_SOURCE_PROVIDER_ID,
} from "./config.js";
import {
  createCloudflareGatewayNativeProvider,
  getBuiltinSourceProviders,
  type SourceProviders,
} from "./provider.js";

function effectiveSource(
  ctx: ExtensionContext,
  providerId: string,
  fallback: SourceProviders[keyof SourceProviders],
): SourceProviders[keyof SourceProviders] {
  const source = ctx.modelRegistry.getProvider(providerId);
  if (source) return source;
  ctx.ui.notify(`${PROVIDER_ID}: effective ${providerId} provider is unavailable; keeping built-in metadata`, "warning");
  return fallback;
}

export function reconcileEffectiveProviders(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  builtins: SourceProviders = getBuiltinSourceProviders(),
): void {
  try {
    // Initial registration supports --list-models. This session-time replacement
    // picks up models.json and providers registered by earlier/later extensions.
    pi.registerProvider(createCloudflareGatewayNativeProvider({
      openai: effectiveSource(ctx, OPENAI_SOURCE_PROVIDER_ID, builtins.openai),
      anthropic: effectiveSource(ctx, ANTHROPIC_SOURCE_PROVIDER_ID, builtins.anthropic),
      deepseek: effectiveSource(ctx, DEEPSEEK_SOURCE_PROVIDER_ID, builtins.deepseek),
      google: effectiveSource(ctx, GOOGLE_SOURCE_PROVIDER_ID, builtins.google),
      xai: effectiveSource(ctx, XAI_SOURCE_PROVIDER_ID, builtins.xai),
      workersAi: effectiveSource(ctx, WORKERS_AI_SOURCE_PROVIDER_ID, builtins.workersAi),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`${PROVIDER_ID}: could not project effective provider metadata (${message})`, "warning");
  }
}

export default function cloudflareAiGatewayNative(pi: ExtensionAPI): void {
  const builtins = getBuiltinSourceProviders();
  pi.registerProvider(createCloudflareGatewayNativeProvider(builtins));
  pi.on("session_start", (_event, ctx) => reconcileEffectiveProviders(pi, ctx, builtins));
}
