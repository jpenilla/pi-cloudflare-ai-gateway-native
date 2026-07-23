# Pi upstream feasibility

## Summary

The experiment supports a future Pi proposal, but the current repository should remain an extension and test harness. Its useful upstream contribution is the projection and transport architecture—not a claim that Cloudflare currently enables every projected model.

## Reusable design

- Register a complete modern `Provider`; avoid legacy provider configuration.
- Derive capability metadata from Pi's source providers and deep-clone nested values.
- Keep Cloudflare availability and canonical request IDs separate from Pi capability metadata.
- Delegate through public Pi stream implementations rather than copying provider code.
- Select one deterministic transport per model and return failures without hidden retries.
- Apply authentication only after the destination host is known.
- Test headers at the final SDK-created `Request` boundary.
- Keep Workers AI Gateway projections distinct from Pi's standalone Workers AI provider.

Validated representative paths include provider-native OpenAI Responses, Anthropic Messages, Google Generative AI, and xAI Chat, plus account REST Chat for DeepSeek and Workers AI.

## Likely built-in shape

A built-in implementation should use reusable API stream factories and generated projection data where practical, rather than depending on sibling providers at runtime. Each route needs explicit metadata for:

- source provider and Pi API;
- Cloudflare transport family and endpoint;
- canonical request-model mapping;
- host-specific authentication policy; and
- reviewed availability data, if Cloudflare supplies a stable source.

Model capabilities should continue to come from Pi. Cloudflare-specific data should answer routing, billing eligibility, and availability questions only.

## Optional Google cleanup

Pi's current Google stream requires a truthy `options.apiKey`. With a custom Cloudflare base URL, `@google/genai` would normally derive that value into `x-goog-api-key`. The extension prevents this with an explicit empty header sentinel, verified at the final fetch boundary.

A separate Pi cleanup could support header-authenticated custom Google base URLs without requiring a synthetic SDK key. That would simplify this extension but is not required for it to work. Cloudflare's base URL should still include `/google-ai-studio/v1beta`, which accepts the current SDK's `parametersJsonSchema` unchanged.

## Open questions before a broad provider PR

1. **Availability discovery:** Cloudflare does not currently expose an account-specific model-by-surface capability endpoint.
2. **Catalog policy:** Pi can project compatible source models, but Cloudflare catalog membership does not guarantee every provider-native or REST schema surface.
3. **xAI eligibility:** `grok-4.5` works through account REST Chat and `/ai/run` but not the tested provider-native xAI routes.
4. **Google eligibility:** some public catalog entries differ across native, REST Chat, and `/ai/run`.
5. **DeepSeek fidelity:** Unified Billing works through catalog surfaces while the provider-native DeepSeek route remains BYOK-only.
6. **Usage semantics:** xAI reasoning, output, and cache totals should not be normalized speculatively.
7. **Manual evidence:** several routes still need final dashboard attribution and billing-counter confirmation.

## Recommended PR scope

A credible first proposal would focus on infrastructure already established by this extension:

1. projection from source-provider metadata;
2. deterministic route descriptors;
3. host-scoped Cloudflare authentication;
4. provider-native OpenAI and Anthropic;
5. Google `v1beta` with no payload translation;
6. account REST Chat for DeepSeek and Workers AI; and
7. focused regression tests for credential isolation and model-ID rewriting.

Broad xAI/Google availability claims and automatic fallback should remain out of scope until Cloudflare documents a stable transport-selection and discovery contract.
