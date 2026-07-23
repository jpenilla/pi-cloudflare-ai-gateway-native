import { describe, expect, it } from "vitest";
import { diagnosticsEnabled, redactGatewayUrl, safeResponseHeaders } from "../src/diagnostics.js";

describe("safe diagnostics", () => {
  it("is explicitly opt-in", () => {
    expect(diagnosticsEnabled({})).toBe(false);
    expect(diagnosticsEnabled({ CLOUDFLARE_AIG_NATIVE_DIAGNOSTICS: "1" })).toBe(true);
    expect(diagnosticsEnabled({ CLOUDFLARE_AIG_NATIVE_DIAGNOSTICS: "true" })).toBe(false);
  });

  it("redacts account IDs and allowlists response headers", () => {
    expect(redactGatewayUrl("https://gateway.ai.cloudflare.com/v1/account-123/gateway/openai")).toBe(
      "https://gateway.ai.cloudflare.com/v1/<redacted-account>/gateway/openai",
    );
    expect(redactGatewayUrl("https://api.cloudflare.com/client/v4/accounts/account-123/ai/v1")).toBe(
      "https://api.cloudflare.com/client/v4/accounts/<redacted-account>/ai/v1",
    );
    expect(safeResponseHeaders({
      "cf-ray": "ray",
      "content-type": "text/event-stream",
      authorization: "Bearer secret",
      "set-cookie": "secret",
    })).toEqual({ "cf-ray": "ray", "content-type": "text/event-stream" });
  });
});
