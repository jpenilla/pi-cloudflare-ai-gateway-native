import type { AuthContext } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  cloudflareGatewayNativeAuth,
  hardenAccountRestHeaders,
  hardenGatewayHeaders,
  hardenGoogleGatewayHeaders,
} from "../src/auth.js";

const context = (values: Record<string, string | undefined>): AuthContext => ({
  env: async (name) => values[name],
  fileExists: async () => false,
});

describe("Cloudflare gateway authentication", () => {
  it("stores token and route identifiers through the native login flow", async () => {
    const answers = ["secret-token", "account", "gateway"];
    const credential = await cloudflareGatewayNativeAuth().login!({
      signal: new AbortController().signal,
      prompt: vi.fn(async () => answers.shift()!),
      notify: vi.fn(),
    });

    expect(credential).toEqual({
      type: "api_key",
      key: "secret-token",
      env: { CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_GATEWAY_ID: "gateway" },
    });
  });

  it("resolves the token for both host-scoped Cloudflare auth mechanisms", async () => {
    const result = await cloudflareGatewayNativeAuth().resolve({
      ctx: context({
        CLOUDFLARE_API_KEY: "gateway-token",
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_GATEWAY_ID: "gateway",
      }),
      signal: new AbortController().signal,
    });

    expect(result?.auth.apiKey).toBe("gateway-token");
    expect(result?.auth.headers?.["cf-aig-authorization"]).toBe("Bearer gateway-token");
    expect(result?.auth.headers).toMatchObject({ Authorization: null, "x-api-key": null, "x-goog-api-key": null });
    expect(result?.env).toEqual({ CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_GATEWAY_ID: "gateway" });
  });

  it("uses an empty Google SDK key sentinel without exposing the Cloudflare token", () => {
    expect(hardenGoogleGatewayHeaders({
      "cf-aig-authorization": "Bearer gateway-token",
      "x-goog-api-key": "upstream-key",
    })).toMatchObject({
      Authorization: null,
      "x-api-key": null,
      "x-goog-api-key": "",
      "cf-aig-authorization": "Bearer gateway-token",
    });
  });

  it("hardens account REST headers and controls gateway attribution", () => {
    expect(hardenAccountRestHeaders({
      authorization: "Bearer caller",
      "CF-AIG-Authorization": "Bearer native",
      "cf-aig-gateway-id": "caller-gateway",
      "X-API-Key": "upstream",
      "x-safe": "kept",
    }, "configured-gateway")).toEqual({
      "x-safe": "kept",
      "x-api-key": null,
      "x-goog-api-key": null,
      "cf-aig-gateway-id": "configured-gateway",
    });
  });

  it("strips upstream auth case-insensitively after caller headers are merged", () => {
    const headers = hardenGatewayHeaders({
      authorization: "Bearer upstream",
      "X-API-Key": "upstream-key",
      "x-Goog-Api-Key": "google-key",
      "CF-AIG-Authorization": "Bearer gateway-token",
      "x-safe": "kept",
    });

    expect(headers).toEqual({
      "x-safe": "kept",
      Authorization: null,
      "x-api-key": null,
      "x-goog-api-key": null,
      "cf-aig-authorization": "Bearer gateway-token",
    });
    expect(Object.values(headers)).not.toContain("Bearer upstream");
    expect(Object.values(headers)).not.toContain("upstream-key");
  });
});
