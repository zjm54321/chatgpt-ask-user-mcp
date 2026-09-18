# ChatGPT Ask User MCP

A tiny **remote MCP App for ChatGPT Web**. It gives ChatGPT one tool, `ask_user`, so the model can stop at a decision point, show you a native-looking question card, receive your choice, and continue the same conversation.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fzjm54321%2Fchatgpt-ask-user-mcp)

## Use it

### 1. Deploy

Click **Deploy to Render** above.

Render builds and runs the MCP server from this repository. When deployment finishes, the endpoint is:

```text
https://<your-service>.onrender.com/mcp
```

Health check:

```text
https://<your-service>.onrender.com/health
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

The tool supports single choice, multiple choice, optional free text, and free-text-only questions.

## ChatGPT-native appearance

The widget uses OpenAI's official `@openai/apps-sdk-ui` package together with MCP host styling via `useHostStyles()`. It inherits the host typography and theme variables, so ChatGPT light/dark mode is handled by the host instead of a separate hand-written theme.

## Scope

This repository is intentionally only for the **remote ChatGPT Web MCP** use case:

- one remote Streamable HTTP MCP endpoint
- one `ask_user` tool
- one interactive UI widget
- no database
- no user data storage
- no Docker image
- no npm/CLI distribution
- no other MCP-client compatibility work

The public demo endpoint uses **no authentication** because the tool only renders a question and sends the answer back into the current ChatGPT conversation.

## Implementation

- MCP server: `@modelcontextprotocol/sdk`
- MCP App binding: `@modelcontextprotocol/ext-apps`
- UI: React + official `@openai/apps-sdk-ui`
- Theme: host-provided styles / light-dark mode
- Continuation: ChatGPT `sendFollowUpMessage()`, with MCP Apps `sendMessage()` fallback
- Deployment: Render Blueprint via `render.yaml`

## License

Copyright (C) 2026 zjm54321

Licensed under the **GNU General Public License v3.0 only (GPL-3.0-only)**. See [LICENSE](LICENSE).
