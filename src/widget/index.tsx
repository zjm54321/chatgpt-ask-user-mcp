// SPDX-License-Identifier: GPL-3.0-only
import {
  useApp,
  useDocumentTheme,
  useHostStyles,
} from "@modelcontextprotocol/ext-apps/react";
import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { Textarea } from "@openai/apps-sdk-ui/components/Textarea";
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

type Choice = {
  id: string;
  label: string;
  value: string;
  description?: string;
};

type AskUserData = {
  question: string;
  options: Choice[];
  allowMultiple: boolean;
  allowOther: boolean;
  placeholder: string;
  submitLabel: string;
  context?: string;
};

function App() {
  const [data, setData] = useState<AskUserData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const { app, error } = useApp({
    appInfo: { name: "Ask User", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (createdApp: McpApp) => {
      createdApp.ontoolresult = (result) => {
        setData(result.structuredContent as unknown as AskUserData);
        setSelectedIds([]);
        setOtherText("");
        setSubmitted(false);
        setErrorText(null);
      };
    },
  });

  useHostStyles(app, app?.getHostContext());
  useDocumentTheme();

  const selectedChoices = useMemo(
    () =>
      data?.options.filter((choice) => selectedIds.includes(choice.id)) ?? [],
    [data, selectedIds],
  );

  if (error) {
    return (
      <div className="p-3 text-sm text-secondary">
        Unable to load the question: {error.message}
      </div>
    );
  }

  if (!app || !data) {
    return (
      <div className="p-3 text-sm text-secondary">
        Waiting for the question…
      </div>
    );
  }

  const freeTextOnly = data.options.length === 0;
  const hasAnswer =
    selectedChoices.length > 0 || (data.allowOther && otherText.trim().length > 0);

  const toggleChoice = (choice: Choice) => {
    if (submitted || sending) return;

    setSelectedIds((current) => {
      if (!data.allowMultiple) {
        return current.includes(choice.id) ? [] : [choice.id];
      }

      return current.includes(choice.id)
        ? current.filter((id) => id !== choice.id)
        : [...current, choice.id];
    });
  };

  const submit = async () => {
    if (!hasAnswer || submitted || sending) return;

    setSending(true);
    setErrorText(null);

    const selected =
      selectedChoices.length > 0
        ? selectedChoices
            .map((choice) => `- ${choice.label} (${choice.value})`)
            .join("\n")
        : "(none)";

    const freeText = otherText.trim();
    const followUp = [
      "I answered the pending question from the Ask User MCP app.",
      `Question: ${data.question}`,
      `Selected answer(s):\n${selected}`,
      freeText ? `Additional answer: ${freeText}` : "",
      "Continue the previous task using this answer. Do not ask the same question again unless new information makes it necessary.",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const openai = (window as typeof window & {
        openai?: {
          sendFollowUpMessage?: (args: {
            prompt: string;
            scrollToBottom?: boolean;
          }) => Promise<void>;
        };
      }).openai;

      if (openai?.sendFollowUpMessage) {
        await openai.sendFollowUpMessage({
          prompt: followUp,
          scrollToBottom: true,
        });
      } else {
        const result = await app.sendMessage({
          role: "user",
          content: [{ type: "text", text: followUp }],
        });

        if (result.isError) {
          throw new Error("The host rejected the follow-up message.");
        }
      }

      setSubmitted(true);
    } catch (submitError) {
      setErrorText(
        submitError instanceof Error
          ? submitError.message
          : "Failed to submit the answer.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="w-full max-w-2xl bg-surface text-primary">
      <div className="flex flex-col gap-3 p-1">
        <header className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold leading-snug">
            {data.question}
          </h2>
          {data.context ? (
            <p className="text-sm leading-snug text-secondary">
              {data.context}
            </p>
          ) : null}
        </header>

        {data.options.length > 0 ? (
          <div
            className="flex flex-col gap-2"
            role={data.allowMultiple ? "group" : "radiogroup"}
            aria-label={data.question}
          >
            {data.options.map((choice) => {
              const selected = selectedIds.includes(choice.id);
              return (
                <button
                  key={choice.id}
                  type="button"
                  role={data.allowMultiple ? undefined : "radio"}
                  aria-checked={data.allowMultiple ? undefined : selected}
                  aria-pressed={data.allowMultiple ? selected : undefined}
                  disabled={submitted || sending}
                  onClick={() => toggleChoice(choice)}
                  className={[
                    "group flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                    "border-default bg-surface hover:bg-subtle",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    selected ? "border-primary/60 bg-subtle" : "",
                    submitted || sending ? "cursor-default opacity-70" : "cursor-pointer",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border",
                      data.allowMultiple ? "rounded-[5px]" : "rounded-full",
                      selected ? "border-primary bg-primary" : "border-default bg-surface",
                    ].join(" ")}
                  >
                    {selected ? (
                      data.allowMultiple ? (
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
                          <path
                            d="m4 8.2 2.4 2.3L12 5.3"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-white"
                          />
                        </svg>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">
                      {choice.label}
                    </span>
                    {choice.description ? (
                      <span className="mt-0.5 block text-xs leading-snug text-secondary">
                        {choice.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {data.allowOther ? (
          <Textarea
            value={otherText}
            onChange={(event) => setOtherText(event.target.value)}
            placeholder={data.placeholder}
            rows={freeTextOnly ? 3 : 2}
            disabled={submitted || sending}
            aria-label={freeTextOnly ? data.question : "Other answer"}
          />
        ) : null}

        {errorText ? (
          <p className="text-xs text-danger">{errorText}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-0.5">
          {submitted ? (
            <span className="text-xs text-secondary">Answer submitted</span>
          ) : null}
          <Button
            type="button"
            color="primary"
            variant="solid"
            size="sm"
            disabled={!hasAnswer || submitted || sending}
            onClick={submit}
          >
            {sending ? "Sending…" : data.submitLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

const rootElement = document.getElementById("ask-user-root");
if (!rootElement) {
  throw new Error("Missing #ask-user-root element.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
