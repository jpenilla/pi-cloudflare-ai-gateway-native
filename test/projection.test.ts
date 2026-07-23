import { hasApi } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { PROVIDER_ID } from "../src/config.js";
import {
  createAnthropicCatalog,
  createDeepSeekCatalog,
  createGoogleCatalog,
  createOpenAICatalog,
  createWorkersAICatalog,
  createXAICompletionsCatalog,
  createXAIResponsesCatalog,
} from "../src/projection.js";
import {
  getBuiltinAnthropicProvider,
  getBuiltinDeepSeekProvider,
  getBuiltinGoogleProvider,
  getBuiltinOpenAIProvider,
  getBuiltinWorkersAIProvider,
  getBuiltinXAIProvider,
} from "../src/provider.js";

const TEST_MODEL_ID = "gpt-5.4-mini";

describe("OpenAI route projection", () => {
  it("projects every Responses-capable source model and inherits metadata", () => {
    const sourceProvider = getBuiltinOpenAIProvider();
    const sources = sourceProvider.getModels().filter((model) => hasApi(model, "openai-responses"));
    const catalog = createOpenAICatalog(sourceProvider);
    const source = sources.find((model) => model.id === TEST_MODEL_ID)!;
    const projected = catalog.find((model) => model.id === TEST_MODEL_ID)!;

    expect(catalog.map((model) => model.id)).toEqual(sources.map((model) => model.id));
    expect(projected).toMatchObject({
      id: TEST_MODEL_ID,
      provider: PROVIDER_ID,
      api: "openai-responses",
      reasoning: source.reasoning,
      input: source.input,
      contextWindow: source.contextWindow,
      maxTokens: source.maxTokens,
      thinkingLevelMap: source.thinkingLevelMap,
      compat: source.compat,
      cost: source.cost,
    });
  });

  it("projects every native Anthropic Messages model", () => {
    const sourceProvider = getBuiltinAnthropicProvider();
    const sources = sourceProvider.getModels().filter((model) => hasApi(model, "anthropic-messages"));
    const catalog = createAnthropicCatalog(sourceProvider);

    expect(catalog.map((model) => model.id)).toEqual(sources.map((model) => model.id));
    expect(catalog[0]).toMatchObject({
      provider: PROVIDER_ID,
      api: "anthropic-messages",
    });
    expect(catalog[0]?.baseUrl).toContain("/anthropic");
  });

  it("projects every DeepSeek chat model through account REST with inherited metadata", () => {
    const sourceProvider = getBuiltinDeepSeekProvider();
    const sources = sourceProvider.getModels().filter((model) => hasApi(model, "openai-completions"));
    const catalog = createDeepSeekCatalog(sourceProvider);

    expect(catalog.map((model) => model.id)).toEqual(sources.map((model) => model.id));
    expect(catalog[0]).toMatchObject({
      provider: PROVIDER_ID,
      api: "openai-completions",
      compat: sources[0]?.compat,
    });
    expect(catalog[0]?.baseUrl).toContain("api.cloudflare.com/client/v4/accounts/");
  });

  it("projects every native Google model with inherited metadata", () => {
    const sourceProvider = getBuiltinGoogleProvider();
    const sources = sourceProvider.getModels().filter((model) => hasApi(model, "google-generative-ai"));
    const catalog = createGoogleCatalog(sourceProvider);

    expect(catalog.map((model) => model.id)).toEqual(sources.map((model) => model.id));
    expect(catalog[0]).toMatchObject({ provider: PROVIDER_ID, api: "google-generative-ai" });
    expect(catalog.every((model) => model.baseUrl.includes("/google-ai-studio/v1beta"))).toBe(true);
  });

  it("projects every Workers AI chat model without changing model IDs", () => {
    const sourceProvider = getBuiltinWorkersAIProvider();
    const sources = sourceProvider.getModels().filter((model) => hasApi(model, "openai-completions"));
    const catalog = createWorkersAICatalog(sourceProvider);

    expect(catalog.map((model) => model.id)).toEqual(sources.map((model) => model.id));
    expect(catalog.every((model) => model.id.startsWith("@cf/"))).toBe(true);
    expect(catalog.every((model) => model.baseUrl.includes("api.cloudflare.com/client/v4/accounts/"))).toBe(true);
  });

  it("projects both native xAI OpenAI wire formats", () => {
    const sourceProvider = getBuiltinXAIProvider();
    const completions = createXAICompletionsCatalog(sourceProvider);
    const responses = createXAIResponsesCatalog(sourceProvider);

    expect(completions.map((model) => model.id)).toEqual(["grok-4.3", "grok-build-0.1"]);
    expect(responses.map((model) => model.id)).toEqual(["grok-4.5"]);
    expect([...completions, ...responses].every((model) => model.baseUrl.includes("/grok/v1"))).toBe(true);
  });

  it("deep-clones nested metadata and drops source headers", () => {
    const sourceProvider = getBuiltinOpenAIProvider();
    const source = sourceProvider.getModels().find((model) => model.id === TEST_MODEL_ID)!;
    const originalInputCost = source.cost.input;
    const projected = createOpenAICatalog(sourceProvider).find((model) => model.id === TEST_MODEL_ID)!;

    projected.cost.input = 999;
    expect(source.cost.input).toBe(originalInputCost);
    expect(projected.headers).toBeUndefined();
  });
});
