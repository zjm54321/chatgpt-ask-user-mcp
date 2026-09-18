# ChatGPT Ask User MCP

A tiny **remote MCP App for ChatGPT Web**, deployed on **Cloudflare Workers**.

It gives ChatGPT one tool, `ask_user`, so the model can stop at a decision point, show you a native-looking question card, receive your choice, and continue the same conversation.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zjm54321/chatgpt-ask-user-mcp)

## Use it

### 1. Deploy to Cloudflare

Click **Deploy to Cloudflare** above.

Cloudflare will clone the repository, build the widget, deploy the Worker, and give you a public `workers.dev` URL.

No database, KV, Durable Object, API key, or other Cloudflare resource is required.

After deployment, your MCP endpoint is:

```text
https://<your-worker>.<your-subdomain>.workers.dev/mcp
```

Health check:

```text
https://<your-worker>.<your-subdomain>.workers.dev/health
```

### 2. Add it to ChatGPT Web

1. Enable **Developer mode** in ChatGPT.
2. Open **Settings → Apps → Create**.
3. Enter the deployed URL ending in `/mcp`.
4. Select **No authentication**.
5. Choose **Scan tools**, then save/create the app.
6. Enable/select the app in a chat.

Test prompt:

> Work through this task. Whenever a choice would materially change the approach, use Ask User to ask me instead of deciding for me.

## Behavior

```text
ChatGPT is doing a task
        ↓
needs your decision
        ↓
calls ask_user
        ↓
┌──────────────────────────────┐
│ Which approach should I use? │
│ ○ Option A                   │
│ ○ Option B                   │
│                              │
│                    [Submit]  │
└──────────────────────────────┘
        ↓
you submit
        ↓
the widget sends your answer
as a follow-up message
        ↓
ChatGPT continues the task
```

The tool supports:

- single choice
- multiple choice
- optional free text
- free-text-only questions
- short context/explanation text
- custom submit button labels

## ChatGPT-native appearance

The widget uses OpenAI's official `@openai/apps-sdk-ui` package together with MCP host styling via `useHostStyles()`.

It inherits ChatGPT's typography and host theme variables, so light/dark mode follows ChatGPT automatically instead of using a separate hand-written theme.

## Architecture

```text
ChatGPT Web
    │
    │ Streamable HTTP MCP
    ▼
Cloudflare Worker
    │
    ├── ask_user tool
    │
    └── embedded self-contained widget HTML
             │
             ▼
        ChatGPT iframe
             │
             └── sendFollowUpMessage()
                     │
                     ▼
               same conversation
```

The Worker is stateless. There is no database and no conversation storage.

## Scope

This repository is intentionally only for the **ChatGPT Web remote MCP** use case:

- one Cloudflare Worker
- one public `/mcp` endpoint
- one `ask_user` tool
- one interactive UI widget
- no database
- no user data storage
- no Docker
- no npm/CLI distribution
- no Render service
- no other MCP-client compatibility work

## Local development

Requirements: Node.js 20+.

```bash
npm install
npm run build
npm run dev
```

Wrangler will start the Worker locally. ChatGPT Web still requires a public HTTPS endpoint, so local mode is mainly for development and MCP Inspector testing.

## Deployment from the CLI

If you already use Wrangler:

```bash
npm install
npm run deploy
```

## Implementation

- MCP server: `@modelcontextprotocol/server`
- Cloudflare MCP transport: `createMcpHandler` from `agents/mcp/server`
- MCP App binding: `@modelcontextprotocol/ext-apps`
- UI: React + official `@openai/apps-sdk-ui`
- Theme: MCP host styles / ChatGPT light-dark mode
- Continuation: ChatGPT `sendFollowUpMessage()`, with MCP Apps `sendMessage()` fallback
- Widget bundle: Vite + `vite-plugin-singlefile`
- Hosting: Cloudflare Workers
- Storage: none

## License

Copyright (C) 2026 zjm54321

Licensed under the **GNU General Public License v3.0 only (GPL-3.0-only)**. See [LICENSE](LICENSE).
