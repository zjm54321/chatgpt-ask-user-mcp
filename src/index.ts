// SPDX-License-Identifier: GPL-3.0-only
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const SERVER_NAME = "chatgpt-ask-user-mcp";
const SERVER_VERSION = "0.4.1-blocking-test";
const ASK_USER_URI = "ui://ask-user/ask-user.html";
const WIDGET_DOMAIN = "https://chatgpt-ask-user-mcp.zhangjm.workers.dev";

const optionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1).optional(),
  description: z.string().optional(),
});

const widgetHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;padding:0;background:transparent;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .box{margin:8px 0;padding:16px;border:2px solid currentColor;border-radius:12px}
  .title{font-size:18px;font-weight:700}
  .desc{margin-top:8px;line-height:1.5}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
</style>
</head>
<body>
  <div class="box">
    <div class="title">BLOCKING WIDGET TEST IS MOUNTED</div>
    <div class="desc">
      If this card is visible while the Ask User tool is still shown as running,
      ChatGPT mounts the MCP App before the tool result returns.
      <br><br>
      Marker: <code>blocking-widget-pre-result-v1</code>
    </div>
  </div>
</body>
</html>`;

function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerAppTool(
    server,
    "ask_user",
    {
      title: "Ask User",
      description:
        "Temporary blocking-widget experiment. The tool deliberately keeps the original MCP call pending before returning, so we can test whether ChatGPT mounts the associated MCP App while the tool is still running.",
      inputSchema: z.object({
        question: z.string().min(1),
        options: z.array(optionSchema).max(8).optional(),
        allow_multiple: z.boolean().optional(),
        allow_other: z.boolean().optional(),
        placeholder: z.string().optional(),
        submit_label: z.string().optional(),
        context: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: {
          resourceUri: ASK_USER_URI,
        },
      },
    },
    async ({ question }) => {
      await new Promise((resolve) => setTimeout(resolve, 30_000));

      return {
        content: [
          {
            type: "text" as const,
            text:
              "Blocking widget experiment completed. The tool result was intentionally delayed. Question: " +
              question,
          },
        ],
        structuredContent: {
          experiment: "blocking-widget-pre-result-v1",
          completed: true,
          question,
        },
      };
    },
  );

  registerAppResource(
    server,
    "Ask User Blocking Test Widget",
    ASK_USER_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description:
        "Static marker widget used to test whether ChatGPT mounts an MCP App before its tool result is available.",
    },
    async () => ({
      contents: [
        {
          uri: ASK_USER_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
              domain: WIDGET_DOMAIN,
            },
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: [],
            },
            "openai/widgetDomain": WIDGET_DOMAIN,
          },
        },
      ],
    }),
  );

  return server;
}

const mcpHandler = createMcpHandler(createServer);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        name: SERVER_NAME,
        version: SERVER_VERSION,
        experiment: "blocking-widget-pre-result-v1",
      });
    }

    if (url.pathname === "/") {
      return Response.json({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        mcp: "/mcp",
        health: "/health",
        experiment: "blocking-widget-pre-result-v1",
      });
    }

    return mcpHandler(request, env, ctx);
  },
} satisfies ExportedHandler;
