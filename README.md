# ChatGPT Ask User MCP

A tiny remote MCP server for ChatGPT Web, deployed on Cloudflare Workers.

It gives ChatGPT one tool, ask_user. When the model needs a clarification or decision, the tool requests the information through standard MCP elicitation. The user's answer returns through the same MCP operation instead of the component posting a second user-authored chat message.

## Why this version is different

Versions before 0.4 used a custom MCP App widget. Submitting the widget called ChatGPT's sendFollowUpMessage API, so the answer appeared as a new conversation message and started another chat turn.

Version 0.4 removes that path entirely.

The flow is now:

~~~text
User message
    |
    v
ChatGPT calls ask_user
    |
    v
MCP server returns input_required
    |
    v
ChatGPT renders the elicitation form
    |
    v
User answers
    |
    v
The MCP client retries the original tool call
with inputResponses
    |
    v
ask_user returns the answer
    |
    v
ChatGPT continues the original task
~~~

There is no sendFollowUpMessage call, no app.sendMessage fallback, and no custom iframe widget.

This removes the extra component-authored conversation message. It does not make any promise about how a particular ChatGPT plan accounts for model or tool usage internally.

## Features

- single-choice questions
- multiple-choice questions
- optional free-text alongside choices
- free-text-only questions
- up to 8 choices
- per-option labels, stable values, and descriptions
- optional short context
- stateless Cloudflare Worker
- no database, KV, Durable Object, or conversation storage

The elicitation UI itself is rendered by the MCP client. Button text, field placeholder styling, collapsing behavior, and other host UI details are therefore controlled by ChatGPT rather than by this server.

## Requirements

The MCP client must support MCP elicitation / multi-round-trip input_required handling. This server uses the current stateless MRTR flow and rejects legacy protocol connections that cannot complete it.

## Deploy to Cloudflare

1. Deploy this repository to Cloudflare Workers.
2. The Worker exposes the MCP endpoint at:

~~~text
https://<your-worker>.<your-subdomain>.workers.dev/mcp
~~~

3. Health check:

~~~text
https://<your-worker>.<your-subdomain>.workers.dev/health
~~~

No additional Cloudflare storage service is required.

## Add it to ChatGPT Web

1. Enable Developer mode in ChatGPT.
2. Open Settings -> Apps -> Create.
3. Enter the deployed URL ending in /mcp.
4. Select No authentication.
5. Scan tools and save the app.
6. Enable the app in a chat.

Example prompt:

> Work through this task. Whenever a choice would materially change the approach, use Ask User to ask me instead of deciding for me.

## Tool input

ask_user accepts:

- question: required question text.
- options: optional list of up to 8 choices.
- allow_multiple: whether more than one listed choice can be selected.
- allow_other: whether the user can also provide free text.
- context: optional short explanation for why the answer is needed.

When options is omitted or empty, the elicitation is a free-text question.

## Implementation

- MCP server: @modelcontextprotocol/server v2
- Cloudflare transport: createMcpHandler from agents/mcp/server
- Human input: MCP input_required + elicitation
- Hosting: Cloudflare Workers
- Storage: none
- UI: rendered by the MCP client

The Worker is stateless. On an input_required response, no Worker remains suspended while the user answers; the client retries the original operation with inputResponses.

## Local development

Requirements: Node.js 20+.

~~~bash
npm install
npm run build
npm run dev
~~~

For MCP inspection, point a compatible inspector/client at the local or tunneled /mcp endpoint.

## Deploy from the CLI

~~~bash
npm install
npm run deploy
~~~

## License

Copyright (C) 2026 zjm54321

Licensed under the GNU General Public License v3.0 only (GPL-3.0-only). See LICENSE.
