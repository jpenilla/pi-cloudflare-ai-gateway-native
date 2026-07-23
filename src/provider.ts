import {
  createProvider,
  hasApi,
  type Api,
  type Model,
  type Provider,
  type ProviderStreams,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import {
  cloudflareGatewayNativeAuth,
  hardenAccountRestHeaders,
  hardenGatewayHeaders,
  hardenGoogleGatewayHeaders,
} from "./auth.js";
import {
  ANTHROPIC_SOURCE_PROVIDER_ID,
  CLOUDFLARE_GATEWAY_ID,
  DEEPSEEK_SOURCE_PROVIDER_ID,
  GOOGLE_SOURCE_PROVIDER_ID,
  materializeAccountRestModel,
  materializeGatewayModel,
  OPENAI_SOURCE_PROVIDER_ID,
  PROVIDER_ID,
  WORKERS_AI_SOURCE_PROVIDER_ID,
  XAI_SOURCE_PROVIDER_ID,
} from "./config.js";
import { diagnosticsEnabled, logDiagnostic, redactGatewayUrl, responseDiagnostic } from "./diagnostics.js";
import {
  ANTHROPIC_ROUTE,
  createAnthropicCatalog,
  createDeepSeekCatalog,
  createGoogleCatalog,
  createOpenAICatalog,
  createWorkersAICatalog,
  createXAICompletionsCatalog,
  createXAIResponsesCatalog,
  DEEPSEEK_REST_ROUTE,
  GOOGLE_ROUTE,
  OPENAI_ROUTE,
  type AccountRestRouteDescriptor,
  type RouteDescriptor,
  WORKERS_AI_REST_ROUTE,
  XAI_COMPLETIONS_ROUTE,
  XAI_RESPONSES_ROUTE,
} from "./projection.js";

export interface SourceProviders {
  openai: Provider;
  anthropic: Provider;
  deepseek: Provider;
  google: Provider;
  xai: Provider;
  workersAi: Provider;
}

function securedOptions(options: StreamOptions | undefined): StreamOptions {
  const callerOnResponse = options?.onResponse;
  return {
    ...options,
    apiKey: undefined,
    headers: hardenGatewayHeaders(options?.headers),
    onResponse: async (response, model) => {
      if (diagnosticsEnabled()) logDiagnostic({ ...responseDiagnostic(response), model: model.id });
      await callerOnResponse?.(response, model);
    },
  };
}

function securedGoogleOptions(options: StreamOptions | undefined): StreamOptions {
  const callerOnResponse = options?.onResponse;
  if (!options?.apiKey) throw new Error("Cloudflare API token is required for Google SDK initialization");
  return {
    ...options,
    headers: hardenGoogleGatewayHeaders(options.headers),
    onResponse: async (response, model) => {
      if (diagnosticsEnabled()) logDiagnostic({ ...responseDiagnostic(response), model: model.id });
      await callerOnResponse?.(response, model);
    },
  };
}

export function createNativeGatewayStreams<TApi extends Api>(
  delegate: ProviderStreams,
  route: RouteDescriptor<TApi>,
  secure: (options: StreamOptions | undefined) => StreamOptions = securedOptions,
): ProviderStreams {
  const prepare = (model: Model<Api>, options: StreamOptions | undefined) => {
    if (!hasApi(model, route.api)) {
      throw new Error(`${route.sourceProvider} route cannot dispatch unsupported API: ${model.api}`);
    }
    const materialized = materializeGatewayModel(model, options?.env, route.gatewayPath);
    if (diagnosticsEnabled()) {
      logDiagnostic({
        event: "request",
        sourceProvider: route.sourceProvider,
        transport: "provider-native",
        api: materialized.api,
        model: materialized.id,
        url: redactGatewayUrl(materialized.baseUrl),
      });
    }
    return { model: materialized, options: secure(options) };
  };

  return {
    stream(model, context, options) {
      const prepared = prepare(model, options);
      return delegate.stream(prepared.model, context, prepared.options);
    },
    streamSimple(model, context, options) {
      const prepared = prepare(model, options);
      return delegate.streamSimple(prepared.model, context, prepared.options);
    },
  };
}

export function createAccountRestGatewayStreams<TApi extends Api>(
  delegate: ProviderStreams,
  route: AccountRestRouteDescriptor<TApi>,
): ProviderStreams {
  const prepare = (model: Model<Api>, options: StreamOptions | undefined) => {
    if (!hasApi(model, route.api)) {
      throw new Error(`${route.sourceProvider} REST route cannot dispatch unsupported API: ${model.api}`);
    }
    if (!options?.apiKey) throw new Error("Cloudflare API token is required for account REST");
    const gatewayId = options.env?.[CLOUDFLARE_GATEWAY_ID]?.trim();
    if (!gatewayId) throw new Error(`${CLOUDFLARE_GATEWAY_ID} is required`);
    const materialized = materializeAccountRestModel(model, options.env);
    const requestModelId = route.requestModelId(model.id);
    if (diagnosticsEnabled()) {
      logDiagnostic({
        event: "request",
        sourceProvider: route.sourceProvider,
        transport: "account-rest",
        api: materialized.api,
        model: requestModelId,
        url: redactGatewayUrl(materialized.baseUrl),
      });
    }
    const callerOnPayload = options.onPayload;
    const callerOnResponse = options.onResponse;
    return {
      model: materialized,
      options: {
        ...options,
        headers: hardenAccountRestHeaders(options.headers, gatewayId),
        onPayload: async (payload: unknown, payloadModel: Model<Api>) => {
          const callerPayload = await callerOnPayload?.(payload, payloadModel);
          const nextPayload = callerPayload ?? payload;
          if (!nextPayload || typeof nextPayload !== "object" || Array.isArray(nextPayload)) {
            throw new Error(`${route.sourceProvider} REST payload must be an object`);
          }
          return { ...nextPayload, model: requestModelId };
        },
        onResponse: async (response: Parameters<NonNullable<StreamOptions["onResponse"]>>[0], responseModel: Model<Api>) => {
          if (diagnosticsEnabled()) logDiagnostic({ ...responseDiagnostic(response), model: responseModel.id });
          await callerOnResponse?.(response, responseModel);
        },
      },
    };
  };

  return {
    stream(model, context, options) {
      const prepared = prepare(model, options);
      return delegate.stream(prepared.model, context, prepared.options);
    },
    streamSimple(model, context, options) {
      const prepared = prepare(model, options);
      return delegate.streamSimple(prepared.model, context, prepared.options);
    },
  };
}

interface ModelRouteBinding {
  modelIds: ReadonlySet<string>;
  streams: ProviderStreams;
}

function routeBinding(models: readonly Model<Api>[], streams: ProviderStreams): ModelRouteBinding {
  return { modelIds: new Set(models.map((model) => model.id)), streams };
}

/** Dispatch models sharing one Pi API to their deterministic Cloudflare transport. */
export function createModelRouteDispatcher(bindings: readonly ModelRouteBinding[]): ProviderStreams {
  const streamsFor = (model: Model<Api>): ProviderStreams => {
    const binding = bindings.find(({ modelIds }) => modelIds.has(model.id));
    if (!binding) throw new Error(`No Cloudflare route registered for ${model.api} model: ${model.id}`);
    return binding.streams;
  };

  return {
    stream: (model, context, options) => streamsFor(model).stream(model, context, options),
    streamSimple: (model, context, options) => streamsFor(model).streamSimple(model, context, options),
  };
}

function getBuiltinProvider(providerId: string): Provider {
  const provider = builtinProviders().find(({ id }) => id === providerId);
  if (!provider) throw new Error(`Pi's built-in ${providerId} provider is unavailable`);
  return provider;
}

export function getBuiltinSourceProviders(): SourceProviders {
  return {
    openai: getBuiltinProvider(OPENAI_SOURCE_PROVIDER_ID),
    anthropic: getBuiltinProvider(ANTHROPIC_SOURCE_PROVIDER_ID),
    deepseek: getBuiltinProvider(DEEPSEEK_SOURCE_PROVIDER_ID),
    google: getBuiltinProvider(GOOGLE_SOURCE_PROVIDER_ID),
    xai: getBuiltinProvider(XAI_SOURCE_PROVIDER_ID),
    workersAi: getBuiltinProvider(WORKERS_AI_SOURCE_PROVIDER_ID),
  };
}

export function getBuiltinOpenAIProvider(): Provider {
  return getBuiltinSourceProviders().openai;
}

export function getBuiltinAnthropicProvider(): Provider {
  return getBuiltinSourceProviders().anthropic;
}

export function getBuiltinDeepSeekProvider(): Provider {
  return getBuiltinSourceProviders().deepseek;
}

export function getBuiltinGoogleProvider(): Provider {
  return getBuiltinSourceProviders().google;
}

export function getBuiltinXAIProvider(): Provider {
  return getBuiltinSourceProviders().xai;
}

export function getBuiltinWorkersAIProvider(): Provider {
  return getBuiltinSourceProviders().workersAi;
}

export function createCloudflareGatewayNativeProvider(
  sources: SourceProviders = getBuiltinSourceProviders(),
): Provider<"openai-responses" | "anthropic-messages" | "google-generative-ai" | "openai-completions"> {
  const openaiModels = createOpenAICatalog(sources.openai);
  const anthropicModels = createAnthropicCatalog(sources.anthropic);
  const deepseekModels = createDeepSeekCatalog(sources.deepseek);
  const googleModels = createGoogleCatalog(sources.google);
  const xaiCompletionsModels = createXAICompletionsCatalog(sources.xai);
  const xaiResponsesModels = createXAIResponsesCatalog(sources.xai);
  const workersAiModels = createWorkersAICatalog(sources.workersAi);

  return createProvider({
    id: PROVIDER_ID,
    name: "Cloudflare AI Gateway (native semantics, experimental)",
    auth: { apiKey: cloudflareGatewayNativeAuth() },
    models: [
      ...openaiModels,
      ...anthropicModels,
      ...deepseekModels,
      ...googleModels,
      ...xaiCompletionsModels,
      ...xaiResponsesModels,
      ...workersAiModels,
    ],
    api: {
      "openai-responses": createModelRouteDispatcher([
        routeBinding(openaiModels, createNativeGatewayStreams(sources.openai, OPENAI_ROUTE)),
        routeBinding(xaiResponsesModels, createNativeGatewayStreams(sources.xai, XAI_RESPONSES_ROUTE)),
      ]),
      "anthropic-messages": createNativeGatewayStreams(sources.anthropic, ANTHROPIC_ROUTE),
      "google-generative-ai": createNativeGatewayStreams(sources.google, GOOGLE_ROUTE, securedGoogleOptions),
      "openai-completions": createModelRouteDispatcher([
        routeBinding(deepseekModels, createAccountRestGatewayStreams(sources.deepseek, DEEPSEEK_REST_ROUTE)),
        routeBinding(xaiCompletionsModels, createNativeGatewayStreams(sources.xai, XAI_COMPLETIONS_ROUTE)),
        routeBinding(workersAiModels, createAccountRestGatewayStreams(sources.workersAi, WORKERS_AI_REST_ROUTE)),
      ]),
    },
  });
}
