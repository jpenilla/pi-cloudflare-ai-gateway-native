import { type Model } from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { describe, expect, it, vi } from "vitest";

describe("Google Gateway compatibility", () => {
  it("documents that @google/genai reintroduces options.apiKey after a null tombstone", async () => {
    let request: Request | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return new Response("data: {}\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const google = builtinProviders().find((provider) => provider.id === "google")!;
    const source = google.getModels().find((model) => model.id === "gemini-3.1-flash-lite")!;
    const model: Model<"google-generative-ai"> = {
      ...(source as Model<"google-generative-ai">),
      baseUrl: "https://gateway.ai.cloudflare.com/v1/account/gateway/google-ai-studio/v1beta",
    };
    google.streamSimple(model, {
      messages: [{ role: "user", content: [{ type: "text", text: "test" }], timestamp: 0 }],
    }, {
      apiKey: "gateway-token",
      headers: {
        "cf-aig-authorization": "Bearer gateway-token",
        "x-goog-api-key": null,
      },
      maxRetries: 0,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(request?.headers.get("cf-aig-authorization")).toBe("Bearer gateway-token");
    expect(request?.headers.get("x-goog-api-key")).toBe("gateway-token");
    vi.unstubAllGlobals();
  });
});
