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

function ChevronIcon({
  expanded,
  className = "",
}: {
  expanded: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d={expanded ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="m3.5 8.2 2.6 2.5 6.1-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function App() {
  const [data, setData] = useState<AskUserData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const { app, error } = useApp({
    appInfo: { name: "Ask User", version: "0.2.1" },
    capabilities: {},
    onAppCreated: (createdApp: McpApp) => {
      createdApp.ontoolresult = (result) => {
        setData(result.structuredContent as unknown as AskUserData);
        setSelectedIds([]);
        setOtherText("");
        setSubmitted(false);
        setDetailsExpanded(false);
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
      <div className="ask-shell">
        <div className="ask-status ask-status-error">
          无法加载提问卡片：{error.message}
        </div>
      </div>
    );
  }

  if (!app || !data) {
    return (
      <div className="ask-shell">
        <div className="ask-status">正在加载问题…</div>
      </div>
    );
  }

  const freeTextOnly = data.options.length === 0;
  const hasOtherText = data.allowOther && otherText.trim().length > 0;
  const hasAnswer = selectedChoices.length > 0 || hasOtherText;

  const submitLabel =
    !data.submitLabel || data.submitLabel === "Submit"
      ? "提交"
      : data.submitLabel;

  const placeholder =
    !data.placeholder || data.placeholder === "Type your answer…"
      ? freeTextOnly
        ? "请输入你的回答…"
        : "如果上面的选项都不合适，也可以直接输入…"
      : data.placeholder;

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
        : "(未选择预设选项)";

    const freeText = otherText.trim();
    const followUp = [
      "我已经回答了 Ask User 工具正在等待的问题。",
      `问题：${data.question}`,
      `选择：\n${selected}`,
      freeText ? `补充回答：${freeText}` : "",
      "请使用这个回答继续之前的任务；除非出现新的必要信息，否则不要重复询问同一个问题。",
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
          throw new Error("宿主拒绝了这条后续消息。");
        }
      }

      setSubmitted(true);
      setDetailsExpanded(false);
    } catch (submitError) {
      setErrorText(
        submitError instanceof Error
          ? submitError.message
          : "提交失败，请重试。",
      );
    } finally {
      setSending(false);
    }
  };

  const submittedSummary =
    selectedChoices.length > 0
      ? selectedChoices.map((choice) => choice.label).join("、")
      : otherText.trim()
        ? otherText.trim()
        : "已提交回答";

  const selectionSummary =
    selectedChoices.length > 0 && hasOtherText
      ? `已选择：${selectedChoices.map((choice) => choice.label).join("、")} · 已填写补充内容`
      : selectedChoices.length > 0
        ? `已选择：${selectedChoices.map((choice) => choice.label).join("、")}`
        : hasOtherText
          ? "已填写回答"
          : data.allowMultiple
            ? "可选择多个选项"
            : freeTextOnly
              ? "请输入回答后提交"
              : "请选择一个选项";

  return (
    <section className="ask-shell text-primary">
      <div className="ask-card">
        <header className="ask-header">
          <h2 className="ask-title">{data.question}</h2>
          {data.context ? (
            <p className="ask-context">{data.context}</p>
          ) : null}
        </header>

        {submitted && !detailsExpanded ? (
          <button
            type="button"
            className="ask-collapsed"
            onClick={() => setDetailsExpanded(true)}
            aria-expanded="false"
            aria-label="展开已提交的完整选项"
          >
            <span className="ask-collapsed-check">
              <CheckIcon className="h-3 w-3" />
            </span>
            <span className="ask-collapsed-content">
              <span className="ask-collapsed-label">已选择</span>
              <span className="ask-collapsed-value">{submittedSummary}</span>
              {hasOtherText && selectedChoices.length > 0 ? (
                <span className="ask-collapsed-note">含补充回答</span>
              ) : null}
            </span>
            <span className="ask-collapse-toggle" aria-hidden="true">
              <ChevronIcon expanded={false} className="h-4 w-4" />
            </span>
          </button>
        ) : (
          <>
        <div className="ask-body">
          {data.options.length > 0 ? (
            <div
              className="ask-options"
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
                      "ask-option",
                      selected ? "ask-option-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span
                      className={[
                        "ask-indicator",
                        data.allowMultiple
                          ? "ask-indicator-checkbox"
                          : "ask-indicator-radio",
                        selected ? "ask-indicator-selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {selected ? (
                        data.allowMultiple ? (
                          <CheckIcon className="h-3 w-3" />
                        ) : (
                          <span className="ask-radio-dot" />
                        )
                      ) : null}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="ask-option-label">{choice.label}</span>
                      {choice.description ? (
                        <span className="ask-option-description">
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
            <div className={data.options.length > 0 ? "mt-3" : ""}>
              <textarea
                value={otherText}
                onChange={(event) => setOtherText(event.target.value)}
                placeholder={placeholder}
                rows={freeTextOnly ? 4 : 3}
                disabled={submitted || sending}
                aria-label={freeTextOnly ? data.question : "补充回答"}
                className="ask-textarea"
              />
            </div>
          ) : null}

          {errorText ? (
            <div className="ask-error" role="alert">
              {errorText}
            </div>
          ) : null}
        </div>

        <footer className="ask-footer">
          <div className="ask-footer-status">
            {submitted ? (
              <span className="ask-submitted">
                <span className="ask-submitted-icon">
                  <CheckIcon className="h-3 w-3" />
                </span>
                已提交
              </span>
            ) : (
              <span className="truncate">{selectionSummary}</span>
            )}
          </div>

          {!submitted ? (
            <button
              type="button"
              className="ask-submit"
              disabled={!hasAnswer || sending}
              onClick={submit}
            >
              {sending ? "提交中…" : submitLabel}
            </button>
          ) : (
            <button
              type="button"
              className="ask-collapse-action"
              onClick={() => setDetailsExpanded(false)}
              aria-expanded="true"
              aria-label="收起已提交的完整选项"
            >
              <span>收起</span>
              <ChevronIcon expanded={true} className="h-4 w-4" />
            </button>
          )}
        </footer>
          </>
        )}
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
