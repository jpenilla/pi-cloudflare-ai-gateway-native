import { hasApi, type Api, type Model, type Provider } from "@earendil-works/pi-ai";
import {
  ANTHROPIC_GATEWAY_ROUTE,
  accountRestBaseUrlTemplate,
  ANTHROPIC_SOURCE_PROVIDER_ID,
  DEEPSEEK_SOURCE_PROVIDER_ID,
  gatewayBaseUrlTemplate,
  GOOGLE_GATEWAY_ROUTE,
  GOOGLE_SOURCE_PROVIDER_ID,
  OPENAI_GATEWAY_ROUTE,
  OPENAI_SOURCE_PROVIDER_ID,
  PROVIDER_ID,
  WORKERS_AI_SOURCE_PROVIDER_ID,
  XAI_GATEWAY_ROUTE,
  XAI_SOURCE_PROVIDER_ID,
} from "./config.js";

export interface RouteDescriptor<TApi extends Api> {
  sourceProvider: string;
  gatewayPath: string;
  api: TApi;
}

export interface AccountRestRouteDescriptor<TApi extends Api> {
  sourceProvider: string;
  api: TApi;
  requestModelId: (sourceModelId: string) => string;
}

export interface ProjectionRecord<TApi extends Api> {
  sourceProvider: string;
  sourceModelId: string;
  requestModelId: string;
  transport: "provider-native";
  api: TApi;
  gatewayPath: string;
}

export const OPENAI_ROUTE: RouteDescriptor<"openai-responses"> = Object.freeze({
  sourceProvider: OPENAI_SOURCE_PROVIDER_ID,
  gatewayPath: OPENAI_GATEWAY_ROUTE,
  api: "openai-responses",
});

export const ANTHROPIC_ROUTE: RouteDescriptor<"anthropic-messages"> = Object.freeze({
  sourceProvider: ANTHROPIC_SOURCE_PROVIDER_ID,
  gatewayPath: ANTHROPIC_GATEWAY_ROUTE,
  api: "anthropic-messages",
});

export const GOOGLE_ROUTE: RouteDescriptor<"google-generative-ai"> = Object.freeze({
  sourceProvider: GOOGLE_SOURCE_PROVIDER_ID,
  gatewayPath: GOOGLE_GATEWAY_ROUTE,
  api: "google-generative-ai",
});

export const DEEPSEEK_REST_ROUTE: AccountRestRouteDescriptor<"openai-completions"> = Object.freeze({
  sourceProvider: DEEPSEEK_SOURCE_PROVIDER_ID,
  api: "openai-completions",
  requestModelId: (sourceModelId: string) => `deepseek/${sourceModelId}`,
});

export const WORKERS_AI_REST_ROUTE: AccountRestRouteDescriptor<"openai-completions"> = Object.freeze({
  sourceProvider: WORKERS_AI_SOURCE_PROVIDER_ID,
  api: "openai-completions",
  requestModelId: (sourceModelId: string) => sourceModelId,
});

export const XAI_COMPLETIONS_ROUTE: RouteDescriptor<"openai-completions"> = Object.freeze({
  sourceProvider: XAI_SOURCE_PROVIDER_ID,
  gatewayPath: XAI_GATEWAY_ROUTE,
  api: "openai-completions",
});

export const XAI_RESPONSES_ROUTE: RouteDescriptor<"openai-responses"> = Object.freeze({
  sourceProvider: XAI_SOURCE_PROVIDER_ID,
  gatewayPath: XAI_GATEWAY_ROUTE,
  api: "openai-responses",
});

export function createProjectionRecord<TApi extends Api>(
  sourceModelId: string,
  route: RouteDescriptor<TApi>,
): ProjectionRecord<TApi> {
  return Object.freeze({
    sourceProvider: route.sourceProvider,
    sourceModelId,
    requestModelId: sourceModelId,
    transport: "provider-native",
    api: route.api,
    gatewayPath: route.gatewayPath,
  });
}

export function projectRouteModel<TApi extends Api>(
  source: Model<TApi>,
  route: RouteDescriptor<TApi>,
  record: ProjectionRecord<TApi> = createProjectionRecord(source.id, route),
): Model<TApi> {
  if (source.provider !== record.sourceProvider || source.id !== record.sourceModelId || source.api !== record.api) {
    throw new Error(`Source model does not match projection: ${source.provider}/${source.id} (${source.api})`);
  }

  // Source auth/attribution headers are intentionally excluded. structuredClone
  // keeps nested capability, compatibility, thinking, and pricing metadata isolated.
  const { headers: _sourceHeaders, ...metadata } = structuredClone(source);
  return {
    ...metadata,
    id: record.requestModelId,
    provider: PROVIDER_ID,
    baseUrl: gatewayBaseUrlTemplate(route.gatewayPath),
  };
}

/**
 * Project every model using the route's native API from an effective Pi
 * provider. These are route candidates, not an account-specific Cloudflare
 * availability claim; unsupported models fail explicitly at request time.
 */
export function createRouteCatalog<TApi extends Api>(
  sourceProvider: Provider,
  route: RouteDescriptor<TApi>,
): readonly Model<TApi>[] {
  if (sourceProvider.id !== route.sourceProvider) {
    throw new Error(`Expected ${route.sourceProvider} source provider, received ${sourceProvider.id}`);
  }

  return Object.freeze(
    sourceProvider.getModels().flatMap((source) =>
      hasApi(source, route.api) ? [projectRouteModel(source, route)] : [],
    ),
  );
}

export function projectAccountRestModel<TApi extends Api>(
  source: Model<TApi>,
  route: AccountRestRouteDescriptor<TApi>,
): Model<TApi> {
  if (source.provider !== route.sourceProvider || source.api !== route.api) {
    throw new Error(`Source model does not match REST projection: ${source.provider}/${source.id} (${source.api})`);
  }

  const { headers: _sourceHeaders, ...metadata } = structuredClone(source);
  return {
    ...metadata,
    provider: PROVIDER_ID,
    baseUrl: accountRestBaseUrlTemplate(),
  };
}

export function createAccountRestCatalog<TApi extends Api>(
  sourceProvider: Provider,
  route: AccountRestRouteDescriptor<TApi>,
): readonly Model<TApi>[] {
  if (sourceProvider.id !== route.sourceProvider) {
    throw new Error(`Expected ${route.sourceProvider} source provider, received ${sourceProvider.id}`);
  }
  return Object.freeze(
    sourceProvider.getModels().flatMap((source) =>
      hasApi(source, route.api) ? [projectAccountRestModel(source, route)] : [],
    ),
  );
}

export function createOpenAICatalog(sourceProvider: Provider): readonly Model<"openai-responses">[] {
  return createRouteCatalog(sourceProvider, OPENAI_ROUTE);
}

export function createAnthropicCatalog(sourceProvider: Provider): readonly Model<"anthropic-messages">[] {
  return createRouteCatalog(sourceProvider, ANTHROPIC_ROUTE);
}

export function createGoogleCatalog(sourceProvider: Provider): readonly Model<"google-generative-ai">[] {
  return createRouteCatalog(sourceProvider, GOOGLE_ROUTE);
}

export function createDeepSeekCatalog(sourceProvider: Provider): readonly Model<"openai-completions">[] {
  return createAccountRestCatalog(sourceProvider, DEEPSEEK_REST_ROUTE);
}

export function createWorkersAICatalog(sourceProvider: Provider): readonly Model<"openai-completions">[] {
  return createAccountRestCatalog(sourceProvider, WORKERS_AI_REST_ROUTE);
}

export function createXAICompletionsCatalog(sourceProvider: Provider): readonly Model<"openai-completions">[] {
  return createRouteCatalog(sourceProvider, XAI_COMPLETIONS_ROUTE);
}

export function createXAIResponsesCatalog(sourceProvider: Provider): readonly Model<"openai-responses">[] {
  return createRouteCatalog(sourceProvider, XAI_RESPONSES_ROUTE);
}
