# Protocol validation matrix

Sanitized results from representative live requests and local boundary tests. The purpose is to validate transports and expose compatibility gaps—not to certify every projected model.

## Test conditions

- Pi: 0.84.x
- Last validation pass: July 22, 2026; re-pass August 7, 2026
- AI Gateway authentication: enabled
- Third-party billing mode: Unified Billing
- Provider API keys sent by the extension: none
- BYOK surfaces (provider-key forwarding): excluded by design
- Prompts: minimal non-sensitive text and a local `read` tool control

No account identifiers, gateway identifiers, credentials, request/response IDs, private paths, raw payloads, or encrypted reasoning values are retained here.

## Representative extension routes

| Source | Model | Transport | Text | Tool replay | Reasoning/thinking replay | Usage | Billing/log attribution | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI | `gpt-5.4-mini` | provider-native Responses | pass | pass | pass | pass | pass | Encrypted reasoning and tool-result replay completed |
| Anthropic | `claude-haiku-4-5` | provider-native Messages | pass | pass | pass | pass | pass | Thinking signatures survived both turns |
| Google | `gemini-3.1-flash-lite` | provider-native `v1beta` | pass | pass | pass | pass | pending | Current SDK tool schema passed unchanged |
| DeepSeek | `deepseek-v4-flash` | account REST Chat | pass | pass | pass | partial | pending | Canonical `deepseek/…` ID is applied only to the request |
| xAI | `grok-4.3` | provider-native Chat | pass | pass | partial | partial | pending | Reasoning and unusual usage totals need further interpretation |
| Workers AI | Granite Micro; Gemma 4 26B | account REST Chat | pass | pass | n/a | partial | pending | Uses Workers AI billing rather than Unified Billing |

Image input, abort behavior, context overflow, and broad model coverage were not tested. They are not required to establish the current transport design.

## Cross-surface probes

These diagnostics informed deterministic route selection. They are not runtime fallbacks.

| Provider/model | Provider-native | Account REST schema | `/ai/run` | Resulting policy |
| --- | --- | --- | --- | --- |
| DeepSeek V4 Flash/Pro | Cloudflare-only auth returns `401 Authentication Fails (governor)` | Chat succeeds | Pro succeeds | Use account REST Chat; native route remains BYOK-only |
| xAI `grok-4.3` | Chat succeeds | Chat succeeds | not needed | Use provider-native Chat |
| xAI `grok-4.5` | Chat and Responses return `401 No credentials presented` | Chat succeeds; Responses applies a Chat-shaped schema | succeeds | Keep the projected native failure explicit; do not fallback silently |
| xAI `grok-build-0.1` | returns 401 | Chat reports model not found | not pursued | Exclude from Cloudflare bug claims; absent from its current public catalog |
| Google `gemini-3.1-flash-lite` | succeeds | Chat succeeds | not needed | Use provider-native Google `v1beta` |
| Google `gemini-3.5-flash-lite` | upstream identity error | wholesale unavailable | wholesale unavailable | Expose only as a route candidate, not an availability claim |
| Google `gemini-3.5-flash` | upstream identity error | output translation fails | succeeds | Do not add `/ai/run` solely as an implicit fallback |
| Google `gemini-3.6-flash` | upstream identity error | wholesale unavailable | wholesale unavailable | Expose only as a route candidate, not an availability claim |

The public Cloudflare catalog currently lists the tested Google 3.5/3.6 models and `grok-4.5`, but does not document a model-by-surface eligibility matrix. See [Cloudflare findings](./cloudflare-findings.md).

## Google API-version result

Cloudflare's Google `v1` path rejected `parametersJsonSchema`, which current `@google/genai` uses for modern function declarations. The provider-native `v1beta` path accepted the same payload and returned a valid function call. The extension therefore uses `v1beta` and performs no schema rewrite.

A final SDK request test confirms that Google requests contain `cf-aig-authorization`, omit `Authorization` and `x-api-key`, and carry only an empty `x-goog-api-key` sentinel—not the Cloudflare token.

## Security and implementation checks

Automated tests verify:

- only the separate `cloudflare-ai-gateway-native` provider is registered;
- source model metadata is deep-cloned and source authentication headers are discarded;
- account and gateway path components are encoded and materialized at request time;
- provider-native SDK requests retain `cf-aig-authorization` and suppress upstream credentials;
- account REST SDK requests use Cloudflare `Authorization`, force `cf-aig-gateway-id`, and suppress provider-key headers;
- DeepSeek request IDs are rewritten canonically without changing the visible Pi model ID;
- xAI models sharing a Pi API dispatch to their fixed route by model ID;
- diagnostics redact account IDs and never inspect payloads;
- `/compat`, `/ai/run`, and automatic cross-transport retry are absent.

## Known limitations

- Projected entries are route candidates; unsupported account/model combinations fail at request time.
- Google, DeepSeek, xAI, and Workers AI dashboard attribution still needs a final manual confirmation pass.
- xAI reasoning replay and usage accounting remain intentionally unpatched pending clearer semantics.
- Granite Micro produced an empty final display under a forced tool probe; Gemma provides the validated Workers AI tool control.
- The extension does not implement image, audio, video, embedding, or other non-chat model schemas.
