# Pi Cloudflare AI Gateway Native

An experimental [Pi](https://github.com/earendil-works/pi) extension whose purpose is **full native-format coverage of Cloudflare AI Gateway's Unified Billing catalog**: every Unified Billing-eligible model that maps to a Pi built-in provider is projected into Pi and routed through Cloudflare's provider-native or account REST endpoints using the wire format Pi already speaks.

> [!IMPORTANT]
> **Unified Billing only.** One Cloudflare token is both the authentication and the billing principal; upstream provider credentials are never accepted or forwarded. BYOK-only surfaces (DeepSeek's provider-native route, Google Vertex, …) are out of scope by design, and first-party `@cf/*` Workers AI models bill through Workers AI rather than Unified Billing. This is a personal research prototype and potential Pi upstream proof of concept—not a production-supported provider. Cloudflare model eligibility varies by account and invocation surface.

## What it explores

- Covering the full Unified Billing catalog as much as Pi's built-in providers support, instead of hand-picking models.
- Reusing Pi's native OpenAI Responses, Anthropic Messages, Google Generative AI, and OpenAI Chat Completions streams.
- Projecting Pi model metadata instead of maintaining a second capability catalog.
- Host-scoped Cloudflare authentication without forwarding upstream-provider credentials.
- Deterministic transport selection with no silent cross-format fallback.
- Removing reliance on Cloudflare's legacy `/compat` route for Workers AI.

The extension registers a separate `cloudflare-ai-gateway-native` provider and does not replace Pi's existing Cloudflare providers.

## Routes

| Pi source | Cloudflare transport | Pi wire format | Billing | Representative live validation |
| --- | --- | --- | --- | --- |
| OpenAI | provider-native `/openai` | Responses | Unified Billing | text, tools, reasoning replay, usage |
| Anthropic | provider-native `/anthropic` | Messages | Unified Billing | text, tools, thinking replay, usage |
| Google AI Studio | provider-native `/google-ai-studio/v1beta` | Google Generative AI | Unified Billing | text and tool-result replay |
| DeepSeek | account REST Chat | Chat Completions | Unified Billing | text, reasoning, tool-result replay |
| xAI | provider-native `/grok/v1` | Chat Completions or Responses | Unified Billing | `grok-4.3` text and tools |
| Workers AI | account REST Chat | Chat Completions | Workers AI | text and tools |

Projected models are **route candidates**, not availability guarantees: the target is full catalog coverage, but Cloudflare currently exposes no account-specific model-by-surface discovery contract, and some catalog models behave differently across provider-native endpoints, account REST schemas, and `/ai/run`. See the [sanitized Cloudflare findings](./docs/cloudflare-findings.md).

## Install and run

Requirements: Node.js 20 or newer and a current Pi installation.

```bash
npm install
pi --no-extensions -e ./src/index.ts
```

Use `/model` to select `cloudflare-ai-gateway-native` and a projected model. To inspect the projected catalog without starting a session:

```bash
pi --no-extensions -e ./src/index.ts --list-models cloudflare-ai-gateway-native
```

## Configuration

Use Pi's `/login` flow for `cloudflare-ai-gateway-native`, or set:

```bash
export CLOUDFLARE_API_KEY=...
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_GATEWAY_ID=...
```

The token must have the Cloudflare permissions required by the selected AI Gateway surface (Unified Billing run access for third-party models).

Authentication is host-scoped:

- `gateway.ai.cloudflare.com` receives `cf-aig-authorization` only.
- `api.cloudflare.com` receives Cloudflare `Authorization` and `cf-aig-gateway-id`.
- Upstream `Authorization`, `x-api-key`, and credential-bearing `x-goog-api-key` headers are suppressed.

Google requires a small SDK boundary workaround: Pi initializes `@google/genai` with a truthy key, while an explicit empty `x-goog-api-key` prevents that value from becoming an upstream credential header. Tests inspect the final SDK-created request.

## Design constraints

- Unified Billing authentication and billing only; no BYOK provider-key forwarding, so provider-key-required surfaces are excluded rather than hacked around.
- One deterministic transport per projected model.
- No automatic fallback, `/compat`, or implemented `/ai/run` adapter.
- No copied provider implementations, unsupported internal imports, or global `fetch` patches.
- Source model IDs and metadata remain visible; canonical Cloudflare IDs are applied only to outgoing REST payloads when required.
- Catalog projection happens from Pi built-ins at load time and effective providers at session start.

## Diagnostics

Diagnostics are off by default. Enable metadata-only routing and response-status logs with:

```bash
CLOUDFLARE_AIG_NATIVE_DIAGNOSTICS=1 pi --no-extensions -e ./src/index.ts
```

Diagnostics redact account IDs and do not inspect credentials, prompts, tool results, or response bodies.

## Development

```bash
npm run check
```

The test suite covers projection, credential resolution, URL construction, stream dispatch, diagnostics redaction, and final SDK request headers for both Cloudflare hosts. Live tests are intentionally manual and minimal because they consume paid inference.

## Documentation

- [Extension design](./docs/extension-design.md) — architecture and security boundaries
- [Protocol matrix](./docs/protocol-matrix.md) — sanitized validation results and known limitations
- [Cloudflare findings](./docs/cloudflare-findings.md) — cross-surface observations and product-contract questions
- [Pi merge feasibility](./docs/pi-merge-feasibility.md) — possible upstream shape and remaining risks

## Security

Never commit Cloudflare tokens, upstream provider keys, account or gateway identifiers, private prompts, raw gateway exports, response IDs, or encrypted reasoning payloads. `.env` files are ignored; `.env.example` contains variable names only.
