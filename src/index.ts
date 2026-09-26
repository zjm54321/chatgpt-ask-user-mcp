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
const SERVER_VERSION = "0.5.0-two-stage-test";
const ASK_USER_URI = "ui://ask-user/ask-user.html";
const WIDGET_DOMAIN = "https://chatgpt-ask-user-mcp.zhangjm.workers.dev";
const WAIT_PREFIX = "__WAIT__:";

interface Env {
  ASK_SESSIONS: DurableObjectNamespace;
}

type StoredAnswer = {
  selectedIds: string[];
  otherText: string;
};

type WaitResult =
  | { status: "answered"; answer: StoredAnswer }
  | { status: "timeout" };

const optionSchema = z.object({
  label: z.string().min(1).describe("Human-readable option label."),
  value: z.string().min(1).optional(),
  description: z.string().optional(),
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

export class AskSession {
  private waiter:
    | ((result: WaitResult) => void)
    | undefined;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      await this.state.storage.delete("answer");
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/answer") {
      const body = (await request.json()) as Partial<StoredAnswer>;
      const answer: StoredAnswer = {
        selectedIds: Array.isArray(body.selectedIds)
          ? body.selectedIds.filter((id): id is string => typeof id === "string")
          : [],
        otherText:
          typeof body.otherText === "string" ? body.otherText.trim() : "",
      };

      if (answer.selectedIds.length === 0 && !answer.otherText) {
        return Response.json(
          { ok: false, error: "empty answer" },
          { status: 400 },
        );
      }

      await this.state.storage.put("answer", answer);
      this.waiter?.({ status: "answered", answer });
      this.waiter = undefined;

      return Response.json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/wait") {
      const existing =
        await this.state.storage.get<StoredAnswer>("answer");

      if (existing) {
        return Response.json({
          status: "answered",
          answer: existing,
        } satisfies WaitResult);
      }

      const result = await new Promise<WaitResult>((resolve) => {
        let settled = false;

        const finish = (value: WaitResult) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        this.waiter = finish;

        setTimeout(() => {
          if (this.waiter === finish) {
            this.waiter = undefined;
          }
          finish({ status: "timeout" });
        }, 90_000);
      });

      return Response.json(result);
    }

    return new Response("Not Found", { status: 404 });
  }
}

function sessionStub(env: Env, sessionId: string): DurableObjectStub {
  const id = env.ASK_SESSIONS.idFromName(sessionId);
  return env.ASK_SESSIONS.get(id);
}

function createServer(env: Env): McpServer {
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
        "Two-stage Ask User experiment. On a normal question, create an interactive widget and return immediately. " +
        "Then call this same tool again in the SAME assistant turn with question set exactly to __WAIT__:<session-id> " +
        "from the returned context. The second call waits for the widget answer and returns it without posting a new user message.",
      inputSchema: z.object({
        question: z.string().min(1),
        options: z.array(optionSchema).max(8).optional(),
        allow_multiple: z.boolean().optional(),
        allow_other: z.boolean().optional(),
        placeholder: z.string().optional(),
        submit_label: z.string().optional(),
        context: z.string().optional(),
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
      if (question.startsWith(WAIT_PREFIX)) {
        const sessionId = question.slice(WAIT_PREFIX.length).trim();

        if (!sessionId) {
          throw new Error("Missing wait session id.");
        }

        const response = await sessionStub(env, sessionId).fetch(
          "https://ask-session/wait",
        );
        const result = (await response.json()) as WaitResult;

        if (result.status === "timeout") {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Ask User wait timed out without a widget answer. Do not fabricate a user choice.",
              },
            ],
            structuredContent: {
              question: "Ask User wait timed out",
              options: [],
              allowMultiple: false,
              allowOther: false,
              placeholder: "",
              submitLabel: "Submit",
              context: "WAIT_TIMEOUT",
            },
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text:
                "The user answered the already-mounted Ask User widget. Continue the original task in this same assistant turn. Answer payload: " +
                JSON.stringify(result.answer),
            },
          ],
          structuredContent: {
            question: "User answered the Ask User widget",
            options: [],
            allowMultiple: false,
            allowOther: false,
            placeholder: "",
            submitLabel: "Submit",
            context: "ANSWER_JSON:" + JSON.stringify(result.answer),
          },
        };
      }

      const sessionId = crypto.randomUUID();
      const normalizedOptions = (options ?? []).map((option, index) => ({
        id: `option-${index + 1}`,
        label: option.label,
        value: option.value ?? option.label,
        description: option.description,
      }));

      await sessionStub(env, sessionId).fetch("https://ask-session/init", {
        method: "POST",
      });

      return {
        content: [
          {
            type: "text" as const,
            text:
              "The Ask User widget is mounted for the user. IMPORTANT: do not end the assistant turn. " +
              "Immediately call ask_user again with question exactly " +
              WAIT_PREFIX +
              sessionId +
              " and wait for the answer.",
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
          context:
            "WAIT_SESSION:" +
            sessionId +
            (context ? "\n" + context : ""),
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
        "Interactive widget for the two-stage blocking Ask User experiment.",
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
                connectDomains: [WIDGET_DOMAIN],
                resourceDomains: [],
              },
              domain: WIDGET_DOMAIN,
            },
            "openai/widgetCSP": {
              connect_domains: [WIDGET_DOMAIN],
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/answer/")) {
      const sessionId = decodeURIComponent(
        url.pathname.slice("/answer/".length),
      );

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      };

      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      if (request.method !== "POST" || !sessionId) {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: corsHeaders,
        });
      }

      const forwarded = new Request("https://ask-session/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: request.body,
      });

      const response = await sessionStub(env, sessionId).fetch(forwarded);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        name: SERVER_NAME,
        version: SERVER_VERSION,
        experiment: "two-stage-widget-wait",
      });
    }

    if (url.pathname === "/") {
      return Response.json({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        mcp: "/mcp",
        health: "/health",
        experiment: "two-stage-widget-wait",
      });
    }

    const mcpHandler = createMcpHandler(() => createServer(env));
    return mcpHandler(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
