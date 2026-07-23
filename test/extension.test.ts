import { describe, expect, it, vi } from "vitest";
import extension from "../src/index.js";
import { PROVIDER_ID } from "../src/config.js";
import {
  getBuiltinAnthropicProvider,
  getBuiltinDeepSeekProvider,
  getBuiltinGoogleProvider,
  getBuiltinOpenAIProvider,
  getBuiltinWorkersAIProvider,
  getBuiltinXAIProvider,
} from "../src/provider.js";

describe("extension registration", () => {
  it("registers a distinct provider and reconciles effective source metadata on session start", () => {
    const handlers = new Map<string, (event: unknown, context: never) => void>();
    const registerProvider = vi.fn();
    const pi = {
      registerProvider,
      on: vi.fn((event: string, handler: (event: unknown, context: never) => void) => handlers.set(event, handler)),
    };

    extension(pi as never);
    expect(registerProvider).toHaveBeenCalledTimes(1);
    expect(registerProvider.mock.calls[0]![0].id).toBe(PROVIDER_ID);
    expect(registerProvider.mock.calls[0]![0].id).not.toBe("cloudflare-ai-gateway");
    expect(registerProvider.mock.calls[0]![0].id).not.toBe("cloudflare-workers-ai");

    const builtin = getBuiltinOpenAIProvider();
    const effectiveOpenAI = {
      ...builtin,
      getModels: () => builtin.getModels().map((model) =>
        model.id === "gpt-5.4-mini"
          ? { ...structuredClone(model), cost: { ...model.cost, input: 321 } }
          : model,
      ),
    };
    const builtinAnthropic = getBuiltinAnthropicProvider();
    const builtinDeepSeek = getBuiltinDeepSeekProvider();
    const builtinGoogle = getBuiltinGoogleProvider();
    const builtinXAI = getBuiltinXAIProvider();
    const builtinWorkersAI = getBuiltinWorkersAIProvider();
    const context = {
      modelRegistry: {
        getProvider: vi.fn((providerId: string) => {
          if (providerId === "openai") return effectiveOpenAI;
          if (providerId === "anthropic") return builtinAnthropic;
          if (providerId === "deepseek") return builtinDeepSeek;
          if (providerId === "google") return builtinGoogle;
          if (providerId === "xai") return builtinXAI;
          return builtinWorkersAI;
        }),
      },
      ui: { notify: vi.fn() },
    };
    handlers.get("session_start")?.({}, context as never);

    expect(context.modelRegistry.getProvider).toHaveBeenCalledWith("openai");
    expect(context.modelRegistry.getProvider).toHaveBeenCalledWith("anthropic");
    expect(context.modelRegistry.getProvider).toHaveBeenCalledWith("deepseek");
    expect(context.modelRegistry.getProvider).toHaveBeenCalledWith("google");
    expect(context.modelRegistry.getProvider).toHaveBeenCalledWith("xai");
    expect(context.modelRegistry.getProvider).toHaveBeenCalledWith("cloudflare-workers-ai");
    expect(registerProvider).toHaveBeenCalledTimes(2);
    expect(registerProvider.mock.calls[1]![0].id).toBe(PROVIDER_ID);
    expect(
      registerProvider.mock.calls[1]![0].getModels().find((model: { id: string }) => model.id === "gpt-5.4-mini")
        .cost.input,
    ).toBe(321);
  });
});
