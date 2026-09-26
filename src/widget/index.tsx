// SPDX-License-Identifier: GPL-3.0-only
import {
  useApp,
  useDocumentTheme,
  useHostStyles,
} from "@modelcontextprotocol/ext-apps/react";
import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

const WIDGET_DOMAIN = "https://chatgpt-ask-user-mcp.zhangjm.workers.dev";

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

function sessionIdFromContext(context?: string): string | null {
  if (!context?.startsWith("WAIT_SESSION:")) return null;
  const firstLine = context.split("\n", 1)[0];
  return firstLine.slice("WAIT_SESSION:".length).trim() || null;
}

function App() {
  const [data, setData] = useState<AskUserData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const { app, error } = useApp({
    appInfo: { name: "Ask User", version: "0.5.0-two-stage-test" },
    capabilities: {},
    onAppCreated: (createdApp: McpApp) => {
      createdApp.ontoolresult = (result) => {
        const nextData = result.structuredContent as unknown as AskUserData;

        // Ignore the second wait tool's completion result; keep the original
        // question card intact so the UI does not flash into a second card.
        if (!sessionIdFromContext(nextData?.context)) return;

        setData(nextData);
        setSelectedIds([]);
        setOtherText("");
        setSending(false);
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
    return <div className="ask-card error">Widget error: {error.message}</div>;
  }

  if (!app || !data) {
    return <div className="ask-card">Loading Ask User…</div>;
  }

  const sessionId = sessionIdFromContext(data.context);
  const hasAnswer =
    selectedChoices.length > 0 || otherText.trim().length > 0;

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
    if (!sessionId || !hasAnswer || sending || submitted) return;

    setSending(true);
    setErrorText(null);

    try {
      const response = await fetch(
        `${WIDGET_DOMAIN}/answer/${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedIds,
            otherText: otherText.trim(),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSubmitted(true);
    } catch (submitError) {
      setErrorText(
        submitError instanceof Error ? submitError.message : "Submit failed",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="ask-card">
      <h2>{data.question}</h2>

      <div className="options">
        {data.options.map((choice) => {
          const selected = selectedIds.includes(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              disabled={submitted || sending}
              className={selected ? "option selected" : "option"}
              onClick={() => toggleChoice(choice)}
            >
              <span className="indicator">
                {selected ? (data.allowMultiple ? "✓" : "●") : ""}
              </span>
              <span>
                <strong>{choice.label}</strong>
                {choice.description ? (
                  <small>{choice.description}</small>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {data.allowOther ? (
        <textarea
          value={otherText}
          disabled={submitted || sending}
          onChange={(event) => setOtherText(event.target.value)}
          placeholder={data.placeholder || "Type your answer…"}
        />
      ) : null}

      <div className="footer">
        <span>
          {submitted
            ? "已提交。GPT 正在同一轮中继续。"
            : "请选择后提交"}
        </span>
        {!submitted ? (
          <button
            className="submit"
            type="button"
            disabled={!hasAnswer || !sessionId || sending}
            onClick={submit}
          >
            {sending ? "提交中…" : "提交"}
          </button>
        ) : null}
      </div>

      {errorText ? <div className="error">{errorText}</div> : null}
    </section>
  );
}

const rootElement = document.getElementById("ask-user-root");
if (!rootElement) throw new Error("Missing #ask-user-root");

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
