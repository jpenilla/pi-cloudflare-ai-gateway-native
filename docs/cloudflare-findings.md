# Cloudflare AI Gateway: sanitized interoperability findings

This document records reproducible behavior observed while building a Pi extension over Cloudflare AI Gateway Unified Billing. It is intended to help Cloudflare identify the relevant product contract or reporting channel; it is not a claim that every difference is a defect.

## Summary

Model eligibility and schema behavior differ across Cloudflare's documented provider-native, account REST, and `/ai/run` surfaces. The evidence does not indicate malformed Cloudflare authentication: the same account-scoped token succeeds with control models and through other surfaces.

The reporting client uses a single Cloudflare token and never accepts or forwards extra client-supplied provider credentials. Cloudflare-side stored-key or Unified Billing resolution remains controlled by the gateway/account configuration. The findings below focus on the Unified Billing transport contract; surfaces that require client-supplied provider credentials are out of scope for this client rather than defects.

The main request is a documented transport-selection contract for Unified Billing. Clients need to know which surface preserves the provider's request/response semantics most faithfully, how to select another surface deterministically when that route is unavailable, and how to discover model-by-surface eligibility without paid trial requests.

The focused candidates for Cloudflare review are the xAI provider-native eligibility mismatch, xAI REST Responses schema behavior, and Google catalog/surface availability. The DeepSeek and Google API-version observations primarily clarify transport selection rather than establish defects.

## Environment

- AI Gateway authenticated: yes
- Unified Billing credits available: yes
- Provider keys in requests: none
- Prompts: minimal non-sensitive text or one local `read` tool control
- Client: Pi 0.84.x extension plus direct diagnostic HTTP requests
- Validation date: July 22, 2026; re-pass August 7, 2026

No account IDs, gateway IDs, credentials, prompt bodies, raw response IDs, encrypted reasoning, private paths, or full Gateway exports are included.

## Requested transport contract

This selection policy does not appear to be documented clearly today. The [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/) page lists supported provider-native providers, the [REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/) page says it can call any catalog model, individual provider pages document native or compatible URLs, and the [model catalog](https://developers.cloudflare.com/ai/models/) labels models as third-party or Workers AI. None of these currently provides a model-by-surface capability matrix, a fidelity comparison, or a supported precedence/fallback rule.

Please document the recommended Unified Billing transport for each provider/model when the caller wants the highest-fidelity provider behavior, including native streaming events, tool calls and results, reasoning/signature replay, provider-specific usage fields, and error semantics.

The currently documented surfaces have materially different contracts:

1. provider-native endpoints preserve the upstream wire format most directly;
2. account REST Chat, Responses, and Messages expose named compatibility schemas and may translate requests or responses;
3. `/ai/run` uses a model-specific envelope and can succeed where a schema endpoint fails;
4. `env.AI.run()` adds a binding-specific invocation path.

A useful contract would identify:

- the preferred surface for every catalog model/provider under Unified Billing;
- whether a model supports provider-native, Chat, Responses, Messages, `/ai/run`, and the AI binding;
- the request and response wire format actually used by each surface;
- whether streaming, tools, structured output, reasoning, signatures, multimodal input, and native usage accounting survive translation;
- whether a surface is Unified Billing, Workers AI billing, BYOK, or stored-key only;
- whether availability is global, account-specific, region-specific, preview, or temporarily disabled;
- any supported fallback/precedence order when the preferred surface is unavailable;
- whether fallback must be selected explicitly by the caller or may happen automatically; and
- a machine-readable, preferably account-specific discovery endpoint so clients do not infer this from trial requests.

For fidelity-sensitive clients, silent fallback between wire formats would be undesirable. If Cloudflare recommends fallback, please document how callers can opt into or disable it and which semantics may be lost during translation.

## Observed matrix

| Provider/model | Provider-native | Account REST schema endpoint | `/ai/run` | Interpretation |
| --- | --- | --- | --- | --- |
| OpenAI `gpt-5.4-mini` | Responses succeeds | not needed | not needed | native control |
| Anthropic `claude-haiku-4-5` | Messages succeeds | not needed | not needed | native control |
| DeepSeek `deepseek-v4-flash` | 401 `Authentication Fails (governor)` | Chat succeeds | not needed | native Unified Billing not documented; REST catalog works |
| DeepSeek `deepseek-v4-pro` | same 401 | Chat succeeds | succeeds | same model differs by surface |
| xAI `grok-4.3` | Chat succeeds | Chat succeeds | not needed | xAI control |
| xAI `grok-4.5` | Chat and Responses return 401 `No credentials presented.` | Chat succeeds; Responses rejects Responses fields and requires `messages` | succeeds | catalog model works, but native auth and REST Responses translation do not |
| xAI `grok-build-0.1` | 401 `No credentials presented.` | Chat returns model not found | not pursued | absent from Cloudflare's current public model catalog; exclude from bug claims |
| Google `gemini-3.1-flash-lite` | `v1beta` text/tools succeed unchanged; `v1` rejects `parametersJsonSchema` | Chat succeeds | not needed | working control; possible documentation clarification only |
| Google `gemini-3.5-flash-lite` | 403 unregistered caller/upstream identity | wholesale unavailable | wholesale unavailable | catalog listing exceeds current billing availability |
| Google `gemini-3.5-flash` | same native 403 | model output translation fails | succeeds | same model differs by schema surface |
| Google `gemini-3.6-flash` | same native 403 | wholesale unavailable | wholesale unavailable | catalog listing exceeds current billing availability |
| Workers AI Granite Micro | n/a per current docs | Chat succeeds with gateway header | not needed | REST control |

## Minimal reproductions

The examples use placeholders. Use a newly scoped/revocable token if Cloudflare requests a fresh reproduction; never paste a stored deployment credential.

### xAI Responses mismatch

```bash
curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT>/ai/v1/responses" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "cf-aig-gateway-id: <GATEWAY>" \
  -H "content-type: application/json" \
  --data '{"model":"xai/grok-4.5","input":"Reply briefly","max_output_tokens":8}'
```

Observed: the model execution layer reports that `messages` is required and that Responses fields such as `input` and `max_output_tokens` are unsupported. The same model succeeds through REST Chat and `/ai/run`.

### xAI provider-native eligibility mismatch

```bash
curl -sS -X POST \
  "https://gateway.ai.cloudflare.com/v1/<ACCOUNT>/<GATEWAY>/grok/v1/chat/completions" \
  -H "cf-aig-authorization: Bearer <TOKEN>" \
  -H "content-type: application/json" \
  --data '{"model":"grok-4.5","messages":[{"role":"user","content":"Reply briefly"}],"max_tokens":8}'
```

Observed: 401 `No credentials presented.` The same authentication and route family succeeds with `grok-4.3`; account REST Chat succeeds with `xai/grok-4.5`.

### DeepSeek Unified Billing surface split — clarification request

Cloudflare's DeepSeek provider page documents the provider-native `/deepseek` route with a customer-supplied DeepSeek key, and the Unified Billing page does not list DeepSeek among provider-native Unified Billing providers. Consistent with that documentation, Cloudflare-only authentication on the native route returns 401 `Authentication Fails (governor)`.

However, the same DeepSeek catalog models succeed under Unified Billing through account REST Chat, and the tested Pro model also succeeds through `/ai/run`. This may be an intentional separation between a BYOK provider proxy and Cloudflare's wholesale execution catalog rather than a defect. The open product question is why Cloudflare-managed DeepSeek billing cannot preserve the provider-native wire format when Cloudflare can already authenticate, execute, and bill the model through another surface, and whether provider-native Unified Billing for DeepSeek is planned.

This distinction should also be exposed through transport discovery so clients can know that DeepSeek is Unified Billing-capable but only on particular surfaces.

### Google API-version behavior

The current `@google/genai` client serializes function declarations with `parametersJsonSchema`. Cloudflare's provider-native `v1` path rejects that field, but its `v1beta` path accepts it unchanged and returns a valid function call. The extension therefore uses `v1beta`; it does not rewrite the schema.

This is not strong evidence of a proxy bug because Cloudflare permits callers to append the upstream endpoint and its SDK example supplies only the provider base URL, allowing the SDK to choose its version. The provider documentation could nevertheless clarify that the cURL `v1` example does not support every field emitted by the current SDK and that modern function declarations require `v1beta`.

### Google surface mismatch

Use the documented Google native route with `cf-aig-authorization`, account REST Chat with `google/<model>`, and `/ai/run` with the same canonical model. `gemini-3.5-flash` succeeds only through `/ai/run`; `gemini-3.1-flash-lite` is the successful control on both native and REST Chat.

## Questions for Cloudflare

1. For each provider, which Unified Billing surface is recommended for the highest-fidelity native behavior: provider-native, a named account REST schema, `/ai/run`, or the AI binding?
2. Is there a supported fallback/precedence order when that preferred surface does not support a model? Must callers choose it explicitly, and what request, response, metadata, or capability fidelity can change?
3. Is there or will there be a machine-readable, preferably account-specific endpoint exposing model, schema, wire-format, feature, and billing eligibility by invocation surface?
4. Does a public model-catalog entry guarantee `/ai/run` only, or some defined set of REST and provider-native surfaces?
5. Is DeepSeek's account REST/`/ai/run` Unified Billing support intentionally separate from its BYOK-only provider-native route? If Cloudflare can execute and bill those models through the catalog, is provider-native Unified Billing planned, or is there a technical or commercial constraint that prevents it?
6. Is provider-native Unified Billing eligibility intentionally narrower than the account REST model catalog, including for xAI models?
7. Should `grok-4.5` work on `/grok/v1/responses`, `/grok/v1/chat/completions`, both, or neither under Unified Billing?
8. Should `/ai/v1/responses` translate `xai/grok-4.5` to the model's supported execution schema rather than reject standard Responses fields?
9. Are Google 3.5/3.6 catalog entries intentionally visible before wholesale availability is enabled?
10. Why does `gemini-3.5-flash` succeed through `/ai/run` while REST Chat reports output translation failure?
11. Could the Google provider page clarify that modern `parametersJsonSchema` function declarations require the `v1beta` path, while its cURL example uses `v1`?
12. For `@google/genai`, is a Gateway token intentionally expected in `x-goog-api-key`, or should the SDK example show `cf-aig-authorization` with an explicit non-provider-key auth setup? Authenticated Gateway documentation says provider-native endpoints use `cf-aig-authorization`.

## Why the AI binding was not compared

Binding requests are pre-authenticated and exercise another invocation environment. REST Chat and `/ai/run` already demonstrate that the affected models exist in Cloudflare's execution catalog while particular HTTP surfaces fail. A binding deployment would add state and cost without isolating the provider-native or REST translation behavior.

A binding control would be useful if the investigation expands to universal cross-surface eligibility. Until then, additional paid requests should answer a specific diagnostic question rather than repeat the complete matrix.
