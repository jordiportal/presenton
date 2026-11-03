"use client";
import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { Loader2 } from "lucide-react";
import { LLMConfig } from "@/types/llm_config";
import { setLLMConfig } from "@/store/slices/userConfig";
import { notify } from "@/components/ui/sonner";
import { useTemplateSummaries } from "../../hooks/useTemplateSummaries";

const NO_DEFAULT = "";

const PresentationSettings = ({
  llmConfig,
  setLlmConfig,
}: {
  llmConfig: LLMConfig;
  setLlmConfig: React.Dispatch<React.SetStateAction<LLMConfig>>;
}) => {
  const dispatch = useDispatch();
  const { defaultTemplates, customTemplates, loading, error } =
    useTemplateSummaries({ presentonCloudOnly: llmConfig.LLM === "presenton" });
  const [saving, setSaving] = useState(false);
  const current = llmConfig.DEFAULT_TEMPLATE?.trim() || NO_DEFAULT;
  const knownIds = new Set(
    [...defaultTemplates, ...customTemplates].map((template) => template.id)
  );

  const handleChange = async (value: string) => {
    const previous = llmConfig;
    const next = { ...llmConfig, DEFAULT_TEMPLATE: value };
    setLlmConfig(next);
    setSaving(true);
    try {
      const response = await fetch("/api/user-config", {
        method: "POST",
        body: JSON.stringify({ DEFAULT_TEMPLATE: value }),
      });
      if (!response.ok) throw new Error(`user-config returned ${response.status}`);
      dispatch(setLLMConfig(next));
    } catch {
      setLlmConfig(previous);
      notify.error("Could not save", "The default template was not updated.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="bg-[#F9F8F8] p-7 rounded-[20px]">
        <h4 className="text-sm font-semibold text-[#191919] mb-1">
          Default template
        </h4>
        <p className="text-xs text-[#6B7280] mb-6 leading-relaxed max-w-lg">
          New presentations start the outline with this template instead of
          asking first. It can still be changed from the outline page, and a
          template chosen when the presentation is created takes precedence.
        </p>

        <div className="flex items-center justify-between gap-4 rounded-[10px] bg-white border border-[#EDEEEF] p-4">
          <label
            htmlFor="default-template"
            className="text-sm font-medium text-[#191919] select-none"
          >
            Template
          </label>
          <div className="flex items-center gap-2">
            {(saving || loading) && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9CA3AF]" />
            )}
            <select
              id="default-template"
              value={current}
              disabled={saving || loading}
              onChange={(event) => handleChange(event.target.value)}
              className="min-w-[220px] rounded-[8px] border border-[#EDEEEF] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#D9D6FE] disabled:opacity-60"
            >
              <option value={NO_DEFAULT}>None — ask every time</option>
              {current !== NO_DEFAULT && !loading && !knownIds.has(current) && (
                <option value={current}>{current} (not found)</option>
              )}
              {defaultTemplates.length > 0 && (
                <optgroup label="Built-in">
                  {defaultTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {customTemplates.length > 0 && (
                <optgroup label="Custom">
                  {customTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
        {error && (
          <p className="mt-3 text-xs text-[#B42318]">
            Templates could not be loaded: {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default PresentationSettings;
