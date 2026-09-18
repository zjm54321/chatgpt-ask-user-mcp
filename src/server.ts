// SPDX-License-Identifier: GPL-3.0-only
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const SERVER_NAME = "chatgpt-ask-user-mcp";
const SERVER_VERSION = "0.1.0";
const ASK_USER_URI = "ui://ask-user/ask-user.html";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.resolve(ROOT_DIR, "dist");

function readRequiredFile(fileName: string): string {
  const filePath = path.join(DIST_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing ${filePath}. Run "npm run build" before starting the server.`,
    );
  }
  return fs.readFileSync(filePath, "utf8");
}

function buildWidgetHtml(): string {
  const js = readRequiredFile("widget.js");
  const css = readRequiredFile("widget.css");

  // Keep the widget self-contained so ChatGPT's iframe does not need any
  // external resource domains or a custom CSP allow-list.
  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${css}</style>
</head>
<body>
  <div id="ask-user-root"></div>
  <script type="module">${js}</script>
</body>
</html>`;
}

const optionSchema = z.object({
  label: z.string().min(1).describe("Human-readable option label."),
  value: z
    .string()
    .min(1)
    .optional()
    .describe("Stable option value. Defaults to the label when omitted."),
  description: z
    .string()
    .optional()
    .describe("Optional short explanation shown below the option."),
});

function createMcpServer(widgetHtml: string): McpServer {
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
        "Ask the user a structured clarification or decision question inside ChatGPT and wait for their answer. " +
        "Use this when the user's choice materially affects how the task should continue, when multiple reasonable paths exist, " +
        "or when the user explicitly asks to be consulted. Provide concise options when possible. For yes/no questions, provide two options. " +
        "After calling this tool, do not choose an answer yourself and do not continue the dependent work until the user's follow-up answer arrives.",
      inputSchema: {
        question: z.string().min(1).describe("The question to show the user."),
        options: z
          .array(optionSchema)
          .max(8)
          .optional()
          .describe(
            "Optional choices. Omit or use an empty array for a free-text question.",
          ),
        allow_multiple: z
          .boolean()
          .optional()
          .describe("Allow selecting more than one option. Defaults to false."),
        allow_other: z
          .boolean()
          .optional()
          .describe(
            "Show an additional free-text field alongside the choices. Defaults to false; free-text-only questions always show a text field.",
          ),
        placeholder: z
          .string()
          .optional()
          .describe("Placeholder for the free-text field."),
        submit_label: z
          .string()
          .optional()
          .describe("Optional submit button label. Defaults to Submit."),
        context: z
          .string()
          .optional()
          .describe(
            "Optional one-sentence context explaining why the answer is needed.",
          ),
      },
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
    async ({
      question,
      options,
      allow_multiple,
      allow_other,
      placeholder,
      submit_label,
      context,
    }) => {
      const normalizedOptions = (options ?? []).map((option, index) => ({
        id: `option-${index + 1}`,
        label: option.label,
        value: option.value ?? option.label,
        description: option.description,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text:
              "A user-facing question widget is now shown. Do not infer or fabricate an answer. " +
              "End this turn and wait for the user's selection. The widget will send a follow-up message when the user submits an answer.",
          },
        ],
        structuredContent: {
          question,
          options: normalizedOptions,
          allowMultiple: allow_multiple ?? false,
          allowOther:
            normalizedOptions.length === 0 ? true : (allow_other ?? false),
          placeholder: placeholder ?? "Type your answer…",
          submitLabel: submit_label ?? "Submit",
          context,
        },
      };
    },
  );

  registerAppResource(
    server,
    "Ask User Widget",
    ASK_USER_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description:
        "Interactive ChatGPT-native question card for selecting options or entering free text.",
    },
    async () => ({
      contents: [
        {
          uri: ASK_USER_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
        },
      ],
    }),
  );

  return server;
}

const widgetHtml = buildWidgetHtml();
const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    mcp: "/mcp",
    health: "/health",
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.all("/mcp", async (req, res) => {
  const server = createMcpServer(widgetHtml);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

const port = Number.parseInt(process.env.PORT ?? "8000", 10);
app.listen(port, "0.0.0.0", () => {
  console.log(`${SERVER_NAME} listening on http://0.0.0.0:${port}/mcp`);
});
