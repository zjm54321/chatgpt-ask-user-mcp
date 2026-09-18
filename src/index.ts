// SPDX-License-Identifier: GPL-3.0-only
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

import widgetHtml from "../dist/widget.html";

const SERVER_NAME = "chatgpt-ask-user-mcp";
const SERVER_VERSION = "0.2.1";
const ASK_USER_URI = "ui://ask-user/ask-user.html";
const WIDGET_DOMAIN = "https://chatgpt-ask-user-mcp.zhangjm.workers.dev";

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

const outputChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  description: z.string().optional(),
});

const askUserOutputSchema = z.object({
  question: z.string().min(1),
  options: z.array(outputChoiceSchema).max(8),
  allowMultiple: z.boolean(),
  allowOther: z.boolean(),
  placeholder: z.string(),
  submitLabel: z.string(),
  context: z.string().optional(),
});

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
        "Ask the user a structured clarification or decision question inside ChatGPT and wait for their answer. " +
        "Use this when the user's choice materially affects how the task should continue, when multiple reasonable paths exist, " +
        "or when the user explicitly asks to be consulted. Provide concise options when possible. For yes/no questions, provide two options. " +
        "After calling this tool, do not choose an answer yourself and do not continue the dependent work until the user's follow-up answer arrives.",
      inputSchema: z.object({
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
      }),
      outputSchema: askUserOutputSchema,
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
      });
    }

    if (url.pathname === "/") {
      return Response.json({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        mcp: "/mcp",
        health: "/health",
      });
    }

    return mcpHandler(request, env, ctx);
  },
} satisfies ExportedHandler;
