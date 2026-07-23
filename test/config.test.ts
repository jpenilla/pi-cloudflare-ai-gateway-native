import { describe, expect, it } from "vitest";
import {
  buildAccountRestBaseUrl,
  buildGatewayBaseUrl,
  materializeAccountRestModel,
  materializeGatewayModel,
} from "../src/config.js";
import { createDeepSeekCatalog, createOpenAICatalog, DEEPSEEK_REST_ROUTE } from "../src/projection.js";
import { getBuiltinDeepSeekProvider, getBuiltinOpenAIProvider } from "../src/provider.js";

const env = {
  CLOUDFLARE_ACCOUNT_ID: "account/id",
  CLOUDFLARE_GATEWAY_ID: "gateway name",
};

describe("gateway endpoint materialization", () => {
  it("encodes account and gateway path components", () => {
    expect(buildGatewayBaseUrl("account/id", "gateway name", "openai")).toBe(
      "https://gateway.ai.cloudflare.com/v1/account%2Fid/gateway%20name/openai",
    );
  });

  it("rejects missing route identifiers", () => {
    expect(() => buildGatewayBaseUrl("", "gateway", "openai")).toThrow("CLOUDFLARE_ACCOUNT_ID is required");
    expect(() => buildGatewayBaseUrl("account", " ", "anthropic")).toThrow("CLOUDFLARE_GATEWAY_ID is required");
  });

  it("builds the account REST base URL", () => {
    expect(buildAccountRestBaseUrl("account/id")).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account%2Fid/ai/v1",
    );
  });

  it("materializes the projected model without mutating it", () => {
    const projected = createOpenAICatalog(getBuiltinOpenAIProvider()).find(
      (model) => model.id === "gpt-5.4-mini",
    )!;
    const materialized = materializeGatewayModel(projected, env, "openai");
    expect(materialized.baseUrl).toBe("https://gateway.ai.cloudflare.com/v1/account%2Fid/gateway%20name/openai");
    expect(projected.baseUrl).toContain("{CLOUDFLARE_ACCOUNT_ID}");
  });

  it("materializes DeepSeek REST without changing its catalog ID", () => {
    const projected = createDeepSeekCatalog(getBuiltinDeepSeekProvider()).find(
      (model) => model.id === "deepseek-v4-flash",
    )!;
    const materialized = materializeAccountRestModel(projected, env);
    expect(projected.id).toBe("deepseek-v4-flash");
    expect(materialized.id).toBe("deepseek-v4-flash");
    expect(DEEPSEEK_REST_ROUTE.requestModelId(materialized.id)).toBe("deepseek/deepseek-v4-flash");
    expect(materialized.baseUrl).toBe("https://api.cloudflare.com/client/v4/accounts/account%2Fid/ai/v1");
  });
});
