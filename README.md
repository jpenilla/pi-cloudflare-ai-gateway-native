# Pi Cloudflare AI Gateway Native

An experimental [Pi](https://github.com/earendil-works/pi) extension for exploring Cloudflare AI Gateway with the upstream provider wire formats that Pi already understands.

> [!IMPORTANT]
> This is a personal research prototype and potential Pi upstream proof of concept—not a production-supported provider. Cloudflare model eligibility varies by account and invocation surface.

## What it explores

- Reusing Pi's native OpenAI Responses, Anthropic Messages, Google Generative AI, and OpenAI Chat Completions streams.
- Projecting Pi model metadata instead of maintaining a second capability catalog.
- Host-scoped Cloudflare authentication without forwarding upstream-provider credentials.
- Deterministic transport selection with no silent cross-format fallback.
- Removing reliance on Cloudflare's legacy `/compat` route for Workers AI.

The extension registers a separate `cloudflare-ai-gateway-native` provider and does not replace Pi's existing Cloudflare providers.

## Routes

| Pi source | Cloudflare transport | Pi wire format | Representative live validation |
| --- | --- | --- | --- |
| OpenAI | provider-native `/openai` | Responses | text, tools, reasoning replay, usage |
| Anthropic | provider-native `/anthropic` | Messages | text, tools, thinking replay, usage |
| Google AI Studio | provider-native `/google-ai-studio/v1beta` | Google Generative AI | text and tool-result replay |
| DeepSeek | account REST Chat | Chat Completions | text, reasoning, tool-result replay |
| xAI | provider-native `/grok/v1` | Chat Completions or Responses | `grok-4.3` text and tools |
| Workers AI | account REST Chat | Chat Completions | text and tools; Workers AI billing |

Projected models are **route candidates**, not availability guarantees. Cloudflare currently exposes no account-specific model-by-surface discovery contract, and some catalog models behave differently across provider-native endpoints, account REST schemas, and `/ai/run`. See the [sanitized Cloudflare findings](./docs/cloudflare-findings.md).

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

The token must have the Cloudflare permissions required by the selected AI Gateway surface.

Authentication is host-scoped:

- `gateway.ai.cloudflare.com` receives `cf-aig-authorization` only.
- `api.cloudflare.com` receives Cloudflare `Authorization` and `cf-aig-gateway-id`.
- Upstream `Authorization`, `x-api-key`, and credential-bearing `x-goog-api-key` headers are suppressed.

Google requires a small SDK boundary workaround: Pi initializes `@google/genai` with a truthy key, while an explicit empty `x-goog-api-key` prevents that value from becoming an upstream credential header. Tests inspect the final SDK-created request.

## Design constraints

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
