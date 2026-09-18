# ChatGPT Ask User MCP

A tiny MCP App that gives ChatGPT a structured **ask_user** tool. When the model needs a decision or clarification, it can render a ChatGPT-native question card with options and/or free text. After you submit an answer, the widget sends a follow-up message into the same conversation so ChatGPT can continue the task.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fzjm54321%2Fchatgpt-ask-user-mcp)

## What it looks like

The UI intentionally uses OpenAI's official `@openai/apps-sdk-ui` components plus MCP host theme variables. It inherits ChatGPT's typography, colors, borders, and light/dark theme instead of maintaining a separate visual theme.

Typical flow:

```text
You ask ChatGPT to do a task
        ↓
ChatGPT reaches a decision point
        ↓
ChatGPT calls ask_user
        ↓
A native-looking choice/text card appears
        ↓
You submit an answer
        ↓
The widget sends a follow-up message
        ↓
ChatGPT continues the same task
```

## Tool schema

`ask_user` supports:

- a required question
- up to 8 structured options
- single-select or multi-select
- optional free-text "other" input
- free-text-only questions
- an optional explanation/context line
- a custom submit button label

The tool response explicitly tells the model to stop and wait instead of choosing on your behalf.

## One-click deployment

Click **Deploy to Render** above. The included `render.yaml` creates a small Node web service.

After Render finishes, your MCP endpoint is:

```text
https://<your-render-service>.onrender.com/mcp
```

Health check:

```text
https://<your-render-service>.onrender.com/health
```

This demo intentionally has no authentication. Treat the public endpoint as a non-sensitive utility tool.

## Add it to ChatGPT Web

1. Enable **Developer mode** for your ChatGPT workspace/account.
2. Open **Settings → Apps → Create** (workspace admins/owners can also create it from Workspace Settings → Apps).
3. Enter the deployed MCP endpoint ending in `/mcp`.
4. Choose **No authentication**.
5. Click **Scan tools**, then create/save the app.
6. In a chat, select or @mention the app for the message where you want ChatGPT to use it.

A useful prompt for testing:

> Work through this task. Whenever a choice would materially change the approach, use the Ask User app to ask me instead of deciding for me.

## Local development

Requirements: Node.js 20+.

```bash
npm install
npm run typecheck
npm run build
npm start
```

The local server listens on:

```text
http://localhost:8000/mcp
```

ChatGPT Web requires a remote MCP endpoint; it cannot connect directly to localhost.

## Design notes

- **MCP transport:** stateless Streamable HTTP.
- **UI binding:** `registerAppTool` + `registerAppResource` from `@modelcontextprotocol/ext-apps`.
- **Theme:** `useHostStyles()` and the official Apps SDK UI CSS/components.
- **Continuation:** `window.openai.sendFollowUpMessage()` on ChatGPT, with the MCP Apps `app.sendMessage()` API as a fallback.
- **Self-contained widget:** built JavaScript and CSS are inlined into the MCP resource HTML, so no external asset domains are required.

## Security

The server stores no conversation data and has no database. The submitted answer is sent back to the host conversation by the widget. If you expose additional tools later, add authentication and review their permissions separately.

## License

Copyright (C) 2026 zjm54321

This project is licensed under the **GNU General Public License v3.0 only (GPL-3.0-only)**. See [LICENSE](LICENSE).
