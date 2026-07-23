import { createAssistantMessageEventStream, type Api, type Model, type ProviderStreams, type StreamOptions } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createOpenAICatalog, OPENAI_ROUTE } from "../src/projection.js";
import {
  createCloudflareGatewayNativeProvider,
  createNativeGatewayStreams,
  getBuiltinOpenAIProvider,
} from "../src/provider.js";

describe("native OpenAI stream wrapper", () => {
  it("materializes the URL and hardens final options before delegation", () => {
    let capturedModel: Model<Api> | undefined;
    let capturedOptions: StreamOptions | undefined;
    const capture = vi.fn((model: Model<Api>, _context: unknown, options?: StreamOptions) => {
      capturedModel = model;
      capturedOptions = options;
      return createAssistantMessageEventStream();
    });
    const delegate: ProviderStreams = { stream: capture, streamSimple: capture };
    const wrapper = createNativeGatewayStreams(delegate, OPENAI_ROUTE);
    const model = createOpenAICatalog(getBuiltinOpenAIProvider()).find(
      (candidate) => candidate.id === "gpt-5.4-mini",
    )!;

    wrapper.stream(model, { messages: [] }, {
      env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_GATEWAY_ID: "gateway" },
      headers: {
        Authorization: "Bearer upstream",
        "x-api-key": "upstream-key",
        "cf-aig-authorization": "Bearer gateway-token",
      },
    });

    expect(capturedModel?.baseUrl).toBe("https://gateway.ai.cloudflare.com/v1/account/gateway/openai");
    expect(capturedOptions?.headers).toMatchObject({
      Authorization: null,
      "x-api-key": null,
      "x-goog-api-key": null,
      "cf-aig-authorization": "Bearer gateway-token",
    });
    expect(Object.values(capturedOptions?.headers ?? {})).not.toContain("Bearer upstream");
  });

  it("suppresses the OpenAI SDK Authorization header on the actual fetch request", async () => {
    let request: Request | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createCloudflareGatewayNativeProvider();
    const model = provider.getModels().find((candidate) => candidate.id === "gpt-5.4-mini")!;
    provider.stream(model, { messages: [] }, {
      apiKey: "gateway-token",
      env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_GATEWAY_ID: "gateway" },
      headers: {
        Authorization: "Bearer upstream",
        "x-api-key": "upstream-key",
        "cf-aig-authorization": "Bearer gateway-token",
      },
      maxRetries: 0,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(request?.headers.get("authorization")).toBeNull();
    expect(request?.headers.get("x-api-key")).toBeNull();
    expect(request?.headers.get("x-goog-api-key")).toBeNull();
    expect(request?.headers.get("cf-aig-authorization")).toBe("Bearer gateway-token");
    vi.unstubAllGlobals();
  });

  it("uses the native Anthropic route without upstream SDK auth headers", async () => {
    let request: Request | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return new Response("", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createCloudflareGatewayNativeProvider();
    const model = provider.getModels().find((candidate) => candidate.id === "claude-haiku-4-5")!;
    provider.streamSimple(model, { messages: [] }, {
      env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_GATEWAY_ID: "gateway" },
      headers: {
        Authorization: "Bearer upstream",
        "x-api-key": "upstream-key",
        "cf-aig-authorization": "Bearer gateway-token",
      },
      maxRetries: 0,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(request?.url).toBe("https://gateway.ai.cloudflare.com/v1/account/gateway/anthropic/v1/messages");
    expect(request?.headers.get("authorization")).toBeNull();
    expect(request?.headers.get("x-api-key")).toBeNull();
    expect(request?.headers.get("x-goog-api-key")).toBeNull();
    expect(request?.headers.get("cf-aig-authorization")).toBe("Bearer gateway-token");
    vi.unstubAllGlobals();
  });

  it("uses account REST for DeepSeek with host-scoped Cloudflare auth", async () => {
    let request: Request | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createCloudflareGatewayNativeProvider();
    const model = provider.getModels().find((candidate) => candidate.id === "deepseek-v4-flash")!;
    provider.streamSimple(model, { messages: [] }, {
      apiKey: "gateway-token",
      env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_GATEWAY_ID: "gateway" },
      headers: {
        Authorization: "Bearer upstream",
        "x-api-key": "upstream-key",
        "cf-aig-authorization": "Bearer gateway-token",
      },
      onPayload: (payload) => ({ ...(payload as object), model: "caller-override" }),
      maxRetries: 0,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(request?.url).toBe("https://api.cloudflare.com/client/v4/accounts/account/ai/v1/chat/completions");
    expect(request?.headers.get("authorization")).toBe("Bearer gateway-token");
    expect(request?.headers.get("x-api-key")).toBeNull();
    expect(request?.headers.get("x-goog-api-key")).toBeNull();
    expect(request?.headers.get("cf-aig-authorization")).toBeNull();
    expect(request?.headers.get("cf-aig-gateway-id")).toBe("gateway");
    expect(await request?.clone().json()).toMatchObject({ model: "deepseek/deepseek-v4-flash" });
    vi.unstubAllGlobals();
  });

  it("uses the same hardened account REST transport for Workers AI", async () => {
    let request: Request | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createCloudflareGatewayNativeProvider();
    const model = provider.getModels().find(
      (candidate) => candidate.id === "@cf/ibm-granite/granite-4.0-h-micro",
    )!;
    provider.streamSimple(model, { messages: [] }, {
      apiKey: "gateway-token",
      env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_GATEWAY_ID: "gateway" },
      headers: { Authorization: "Bearer caller", "cf-aig-authorization": "Bearer native" },
      maxRetries: 0,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(request?.url).toBe("https://api.cloudflare.com/client/v4/accounts/account/ai/v1/chat/completions");
    expect(request?.headers.get("authorization")).toBe("Bearer gateway-token");
    expect(request?.headers.get("cf-aig-authorization")).toBeNull();
    expect(request?.headers.get("cf-aig-gateway-id")).toBe("gateway");
    expect(await request?.clone().json()).toMatchObject({ model: "@cf/ibm-granite/granite-4.0-h-micro" });
    vi.unstubAllGlobals();
  });

  it("uses native Google without exposing the Cloudflare token as a Google key", async () => {
    let request: Request | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return new Response("data: {}\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createCloudflareGatewayNativeProvider();
    const model = provider.getModels().find((candidate) => candidate.id === "gemini-3.1-flash-lite")!;
    provider.streamSimple(model, {
      messages: [{ role: "user", content: [{ type: "text", text: "test" }], timestamp: 0 }],
    }, {
      apiKey: "gateway-token",
      env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_GATEWAY_ID: "gateway" },
      headers: {
        Authorization: "Bearer upstream",
        "x-goog-api-key": "upstream-key",
        "cf-aig-authorization": "Bearer gateway-token",
      },
      maxRetries: 0,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(request?.url).toBe(
      "https://gateway.ai.cloudflare.com/v1/account/gateway/google-ai-studio/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse",
    );
    expect(request?.headers.get("authorization")).toBeNull();
    expect(request?.headers.get("x-api-key")).toBeNull();
    expect(request?.headers.get("x-goog-api-key")).toBe("");
    expect(request?.headers.get("cf-aig-authorization")).toBe("Bearer gateway-token");
    vi.unstubAllGlobals();
  });

  it("dispatches both xAI wire formats through the native Grok route", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createCloudflareGatewayNativeProvider();
    const headers = {
      Authorization: "Bearer upstream",
      "x-api-key": "upstream-key",
      "cf-aig-authorization": "Bearer gateway-token",
    };
    const env = { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_GATEWAY_ID: "gateway" };
    const completionsModel = provider.getModels().find((candidate) => candidate.id === "grok-4.3")!;
    const responsesModel = provider.getModels().find((candidate) => candidate.id === "grok-4.5")!;

    provider.streamSimple(completionsModel, { messages: [] }, { env, headers, maxRetries: 0 });
    provider.streamSimple(responsesModel, { messages: [] }, { env, headers, maxRetries: 0 });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requests.map(({ url }) => url).sort()).toEqual([
      "https://gateway.ai.cloudflare.com/v1/account/gateway/grok/v1/chat/completions",
      "https://gateway.ai.cloudflare.com/v1/account/gateway/grok/v1/responses",
    ]);
    for (const request of requests) {
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("x-api-key")).toBeNull();
      expect(request.headers.get("cf-aig-authorization")).toBe("Bearer gateway-token");
    }
    vi.unstubAllGlobals();
  });
});
