# Extension design and operating guide

This document describes the experimental `cloudflare-ai-gateway-native` Pi extension. It registers a separate provider and does not replace either built-in Cloudflare provider.

## Purpose

The extension tests whether Pi can route models through Cloudflare AI Gateway while retaining the Pi source provider's wire format, model metadata, tool behavior, and reasoning replay. It uses deterministic per-model transports: a failed request is returned to the user and is never retried through another Cloudflare surface.

## Provider and catalog

The extension registers one complete modern Pi `Provider` named `cloudflare-ai-gateway-native`. It projects models from Pi's effective providers twice:

1. From `builtinProviders()` at extension load so `--list-models` works.
2. From `ctx.modelRegistry` at `session_start` so applicable provider registrations and `models.json` metadata changes are inherited.

Projection deep-clones source metadata, removes source headers, changes provider ownership and endpoint, and changes the request model ID only when Cloudflare requires it. The visible model ID remains the Pi source ID.

Catalog entries are route candidates. Cloudflare account/model eligibility is not inferred or promised.

## Deterministic routes

| Pi source provider | Cloudflare host and path | Request API | Request model ID |
| --- | --- | --- | --- |
| `openai` | `gateway.ai.cloudflare.com/.../openai` | OpenAI Responses | unchanged |
| `anthropic` | `gateway.ai.cloudflare.com/.../anthropic` | Anthropic Messages | unchanged |
| `google` | `gateway.ai.cloudflare.com/.../google-ai-studio/v1beta` | Google Generative AI | unchanged |
| `deepseek` | `api.cloudflare.com/.../ai/v1/chat/completions` | OpenAI Chat Completions | `deepseek/<source-id>` |
| `xai` Chat models | `gateway.ai.cloudflare.com/.../grok/v1/chat/completions` | OpenAI Chat Completions | unchanged |
| `xai` Responses models | `gateway.ai.cloudflare.com/.../grok/v1/responses` | OpenAI Responses | unchanged |
| `cloudflare-workers-ai` | `api.cloudflare.com/.../ai/v1/chat/completions` | OpenAI Chat Completions | unchanged `@cf/...` |

There is no `/compat`, `/ai/run`, transport retry, REST fallback, model discovery request, or legacy provider alias.

## Authentication boundary

One Cloudflare API token, account ID, and gateway ID are stored in Pi's native credential store.

Authentication is selected only after the destination host is fixed:

- Provider-native Gateway requests clear `options.apiKey`, send the token only as `cf-aig-authorization`, and suppress `Authorization`, `x-api-key`, and `x-goog-api-key`.
- Google retains the token only as the truthy value required to initialize Pi's current Google stream, while an explicit empty `x-goog-api-key` header prevents `@google/genai` from deriving a credential-bearing header. Fetch-boundary tests prove the token remains only in `cf-aig-authorization`.
- Account REST requests remove caller-supplied authentication, retain the token as the OpenAI SDK API key so it generates Cloudflare `Authorization`, force `cf-aig-gateway-id`, remove `cf-aig-authorization`, and suppress `x-api-key` and `x-goog-api-key`.

Tests inspect the actual SDK-created `Request`, not merely intermediate options. No upstream provider credential is accepted or forwarded.

## Stream delegation

The extension delegates to public `Provider.stream` and `Provider.streamSimple` methods from Pi's effective source providers. It does not import unsupported API subpaths or copy Pi's provider implementations. A dispatcher selects the fixed route by catalog model ID when multiple source providers share a Pi API.

## Google compatibility boundary

Cloudflare's native Google endpoint works with `cf-aig-authorization`. `@google/genai` requires Pi to provide a truthy SDK API key, so an explicit empty `x-goog-api-key` header prevents the SDK from deriving a credential-bearing header from that initialization value. The outgoing request contains Cloudflare auth only in `cf-aig-authorization`.

Cloudflare's `v1` path rejects the current SDK's modern `parametersJsonSchema` tool declaration, but the provider-native `v1beta` path accepts it unchanged. The extension therefore includes `v1beta` in the custom base URL, matching the current Google SDK's native schema instead of translating it to the older OpenAPI subset.

All message, tool declaration, tool-result, thinking, signature, response, and usage handling remains in Pi's native Google stream. The extension does not rewrite payloads, copy provider code, import internal modules, replace global `fetch`, flatten Google onto REST Chat, or use `/ai/run`.

A future Pi cleanup could express custom header-only Google authentication directly and eliminate the empty sentinel, but it is no longer a functional blocker.

## Diagnostics

`CLOUDFLARE_AIG_NATIVE_DIAGNOSTICS=1` enables routing metadata and response status only. Both Gateway and account REST URLs redact account IDs. The allowlist excludes request and response bodies, credentials, cookies, and arbitrary headers.

## Validation and cost discipline

Live tests use one representative inexpensive model and minimal prompt per behavior. A successful tool test doubles as the multi-turn/replay test. Models are not swept after the transport policy is established. See `protocol-matrix.md` for sanitized results.

## Commands

```bash
npm install
npm run typecheck
npm test
pi --no-extensions -e ./src/index.ts --list-models cloudflare-ai-gateway-native
```

Configure credentials through Pi's login flow for `cloudflare-ai-gateway-native` or the three environment variables documented in the README.
