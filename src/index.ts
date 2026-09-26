// SPDX-License-Identifier: GPL-3.0-only
import {
  McpServer,
  acceptedContent,
  inputRequired,
  inputResponse,
  type ElicitRequestFormParams,
} from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const SERVER_NAME = "chatgpt-ask-user-mcp";
const SERVER_VERSION = "0.4.0";

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
    .describe("Optional short explanation for the option."),
});

type AskOption = z.infer<typeof optionSchema>;

type NormalizedOption = {
  id: string;
  label: string;
  value: string;
  description?: string;
};

type ElicitedAnswer = {
  answer?: string;
  choice?: string;
  choices?: string[];
  other?: string;
};

function normalizeOptions(options: AskOption[]): NormalizedOption[] {
  return options.map((option, index) => ({
    id: "option-" + (index + 1),
    label: option.label,
    value: option.value ?? option.label,
    description: option.description,
  }));
}

function optionTitle(option: NormalizedOption): string {
  return option.description
    ? option.label + " — " + option.description
    : option.label;
}

function buildRequestedSchema(
  options: NormalizedOption[],
  allowMultiple: boolean,
  allowOther: boolean,
): ElicitRequestFormParams["requestedSchema"] {
  if (options.length === 0) {
    return {
      type: "object",
      properties: {
        answer: {
          type: "string",
          title: "Answer",
          description: "Type your answer.",
          minLength: 1,
        },
      },
      required: ["answer"],
    };
  }

  const titledOptions = options.map((option) => ({
    const: option.id,
    title: optionTitle(option),
  }));

  const properties: ElicitRequestFormParams["requestedSchema"]["properties"] =
    {};

  if (allowMultiple) {
    properties.choices = {
      type: "array",
      title: "Choices",
      items: {
        anyOf: titledOptions,
      },
      minItems: allowOther ? 0 : 1,
      maxItems: options.length,
    };
  } else {
    properties.choice = {
      type: "string",
      title: "Choice",
      oneOf: titledOptions,
    };
  }

  if (allowOther) {
    properties.other = {
      type: "string",
      title: "Other / additional answer",
      description:
        "Use this field when the listed choices do not fully express your answer.",
      minLength: 1,
    };
  }

  const required = allowOther
    ? []
    : [allowMultiple ? "choices" : "choice"];

  return required.length > 0
    ? { type: "object", properties, required }
    : { type: "object", properties };
}

function buildAnswerValidator(
  options: NormalizedOption[],
  allowMultiple: boolean,
  allowOther: boolean,
) {
  if (options.length === 0) {
    return z.object({
      answer: z.string().trim().min(1),
    });
  }

  const allowedIds = new Set(options.map((option) => option.id));
  const selectedId = z
    .string()
    .refine((value) => allowedIds.has(value), "Unknown option.");

  const optionalOther = z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z.string().trim().min(1).optional(),
  );

  if (allowMultiple) {
    const selectedIds = z
      .array(selectedId)
      .min(1)
      .max(options.length)
      .refine(
        (values) => new Set(values).size === values.length,
        "Duplicate options are not allowed.",
      );

    if (!allowOther) {
      return z.object({ choices: selectedIds });
    }

    const optionalSelectedIds = z.preprocess(
      (value) =>
        Array.isArray(value) && value.length === 0 ? undefined : value,
      selectedIds.optional(),
    );

    return z
      .object({
        choices: optionalSelectedIds,
        other: optionalOther,
      })
      .refine(
        (value) => (value.choices?.length ?? 0) > 0 || Boolean(value.other),
        "Choose at least one option or provide another answer.",
      );
  }

  if (!allowOther) {
    return z.object({ choice: selectedId });
  }

  const optionalSelectedId = z.preprocess(
    (value) =>
      typeof value === "string" && value.length === 0 ? undefined : value,
    selectedId.optional(),
  );

  return z
    .object({
      choice: optionalSelectedId,
      other: optionalOther,
    })
    .refine(
      (value) => Boolean(value.choice) || Boolean(value.other),
      "Choose an option or provide another answer.",
    );
}

function requestAnswer(
  question: string,
  context: string | undefined,
  requestedSchema: ElicitRequestFormParams["requestedSchema"],
) {
  const message = context
    ? question + "\n\nContext: " + context
    : question;

  return inputRequired({
    inputRequests: {
      answer: inputRequired.elicit({
        message,
        requestedSchema,
      }),
    },
  });
}

function buildAnswerResult(
  question: string,
  options: NormalizedOption[],
  answer: ElicitedAnswer,
) {
  const selectedIds = answer.choices ?? (answer.choice ? [answer.choice] : []);
  const selected = selectedIds
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is NormalizedOption => Boolean(option))
    .map((option) => ({
      label: option.label,
      value: option.value,
      ...(option.description ? { description: option.description } : {}),
    }));

  return {
    status: "answered",
    question,
    ...(selected.length > 0 ? { selected } : {}),
    ...(answer.answer ? { answer: answer.answer } : {}),
    ...(answer.other ? { other: answer.other } : {}),
  };
}

function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "ask_user",
    {
      title: "Ask User",
      description:
        "Ask the user a structured clarification or decision question using MCP elicitation. " +
        "Use this when the user's answer materially affects how the current task should continue, " +
        "when multiple reasonable paths exist, or when the user explicitly asks to be consulted. " +
        "The answer returns through the same MCP tool call; do not replace this with a chat follow-up message.",
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
            "Allow an additional free-text answer alongside the choices. Defaults to false; free-text-only questions always accept text.",
          ),
        context: z
          .string()
          .optional()
          .describe(
            "Optional one-sentence context explaining why the answer is needed.",
          ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (
      {
        question,
        options: rawOptions,
        allow_multiple,
        allow_other,
        context,
      },
      toolContext,
    ) => {
      const options = normalizeOptions(rawOptions ?? []);
      const allowMultiple = allow_multiple ?? false;
      const allowOther =
        options.length === 0 ? true : (allow_other ?? false);

      const requestedSchema = buildRequestedSchema(
        options,
        allowMultiple,
        allowOther,
      );

      const response = inputResponse(
        toolContext.mcpReq.inputResponses,
        "answer",
      );

      if (response.kind === "missing") {
        return requestAnswer(question, context, requestedSchema);
      }

      if (response.kind !== "elicit") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                question,
                error: "Unexpected MCP input response type.",
              }),
            },
          ],
          isError: true,
        };
      }

      if (response.action !== "accept") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: response.action,
                question,
              }),
            },
          ],
        };
      }

      const validator = buildAnswerValidator(
        options,
        allowMultiple,
        allowOther,
      );
      const accepted = acceptedContent(
        toolContext.mcpReq.inputResponses,
        "answer",
        validator,
      ) as ElicitedAnswer | undefined;

      if (!accepted) {
        return requestAnswer(question, context, requestedSchema);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              buildAnswerResult(question, options, accepted),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}

const mcpHandler = createMcpHandler(createServer, {
  legacy: "reject",
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        name: SERVER_NAME,
        version: SERVER_VERSION,
        interaction: "mcp-elicitation",
      });
    }

    if (url.pathname === "/") {
      return Response.json({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        mcp: "/mcp",
        health: "/health",
        interaction: "mcp-elicitation",
      });
    }

    return mcpHandler(request, env, ctx);
  },
} satisfies ExportedHandler;
