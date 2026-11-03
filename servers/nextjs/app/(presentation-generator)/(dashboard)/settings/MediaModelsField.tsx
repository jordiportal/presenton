"use client";

import React, { useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Search, Star, X } from "lucide-react";
import { notify } from "@/components/ui/sonner";
import { getApiUrl } from "@/utils/api";
import { cn } from "@/lib/utils";

export function parseModelList(raw?: string | null): string[] {
  const seen: string[] = [];
  for (const chunk of (raw || "").split(/[,\n]/)) {
    const model = chunk.trim();
    if (model && !seen.includes(model)) seen.push(model);
  }
  return seen;
}

type MediaModelsFieldProps = {
  title: string;
  description: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  alternatives: string;
  placeholder: string;
  onChange: (next: { defaultModel: string; alternatives: string }) => void;
};

const MediaModelsField = ({
  title,
  description,
  baseUrl,
  apiKey,
  defaultModel,
  alternatives,
  placeholder,
  onChange,
}: MediaModelsFieldProps) => {
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");

  const enabled = useMemo(
    () => parseModelList(alternatives).filter((model) => model !== defaultModel),
    [alternatives, defaultModel],
  );

  const rows = useMemo(() => {
    const all = [
      ...(defaultModel ? [defaultModel] : []),
      ...enabled,
      ...catalog.filter((model) => model !== defaultModel && !enabled.includes(model)),
    ];
    const needle = query.trim().toLowerCase();
    return needle ? all.filter((model) => model.toLowerCase().includes(needle)) : all;
  }, [catalog, defaultModel, enabled, query]);

  const emit = (nextDefault: string, nextAlternatives: string[]) => {
    onChange({
      defaultModel: nextDefault,
      alternatives: nextAlternatives.filter((model) => model !== nextDefault).join(","),
    });
  };

  const makeDefault = (model: string) => {
    const keepPrevious = defaultModel && defaultModel !== model ? [defaultModel] : [];
    emit(model, [...keepPrevious, ...enabled.filter((m) => m !== model)]);
  };

  const toggleAlternative = (model: string) => {
    if (model === defaultModel) return;
    emit(
      defaultModel,
      enabled.includes(model) ? enabled.filter((m) => m !== model) : [...enabled, model],
    );
  };

  const addManual = () => {
    const model = manual.trim();
    if (!model) return;
    if (!defaultModel) emit(model, enabled);
    else if (model !== defaultModel && !enabled.includes(model)) emit(defaultModel, [...enabled, model]);
    setManual("");
  };

  const loadCatalog = async () => {
    if (!baseUrl.trim()) {
      notify.warning("Gateway URL missing", "Set the base URL first.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(getApiUrl("/api/v1/ppt/openai/models/available"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: baseUrl.trim(), api_key: apiKey }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          (data && typeof data.detail === "string" && data.detail) ||
            "The gateway could not list its models.",
        );
      }
      const models = Array.isArray(data) ? (data as string[]) : [];
      setCatalog(models);
      if (!models.length) notify.warning("No models found", "Add the model ids by hand.");
    } catch (error) {
      notify.error(
        "Could not load models",
        error instanceof Error ? error.message : "Check the URL and the API key.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-[12px] bg-white p-10 pt-6">
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-[420px]">
          <h4 className="text-lg font-normal text-[#191919]">{title}</h4>
          <p className="mt-1.5 text-sm text-gray-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadCatalog()}
          disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-[48px] border border-[#EDEEEF] bg-[#EDEEEF] px-3.5 py-2.5 text-xs font-semibold text-[#101323] hover:bg-[#E8F0FF] disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Load gateway models
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-gray-700">Default:</span>
        {defaultModel ? (
          <span className="flex items-center gap-1 rounded-full bg-[#F4F3FF] px-2.5 py-1 font-medium text-[#5146E5]">
            <Star className="h-3 w-3 fill-current" />
            {defaultModel}
          </span>
        ) : (
          <span className="text-amber-700">none — pick one below</span>
        )}
        {enabled.length ? <span className="ml-2 font-medium text-gray-700">Alternatives:</span> : null}
        {enabled.map((model) => (
          <span key={model} className="flex items-center gap-1 rounded-full border border-[#E1E1E5] px-2.5 py-1 text-[#191919]">
            {model}
            <button
              type="button"
              aria-label={`Disable ${model}`}
              onClick={() => toggleAlternative(model)}
              className="text-gray-400 hover:text-gray-700"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter models"
            className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addManual();
            }
          }}
          placeholder={placeholder}
          className="h-10 w-[240px] rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          type="button"
          onClick={addManual}
          disabled={!manual.trim()}
          className="flex h-10 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm text-[#191919] hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      <div className="mt-3 max-h-[280px] overflow-y-auto rounded-lg border border-[#EDEEEF]">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            {query ? "No model matches the filter." : "Load the gateway models or add one by hand."}
          </p>
        ) : (
          rows.map((model) => {
            const isDefault = model === defaultModel;
            const isEnabled = isDefault || enabled.includes(model);
            return (
              <div
                key={model}
                className={cn(
                  "flex items-center justify-between gap-3 border-b border-[#F3F4F6] px-4 py-2.5 last:border-b-0",
                  isEnabled && "bg-[#FAFAFF]",
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    disabled={isDefault}
                    onChange={() => toggleAlternative(model)}
                    className="h-4 w-4 accent-[#5146E5]"
                    aria-label={`Enable ${model}`}
                  />
                  <span className="truncate text-sm text-[#191919]" title={model}>{model}</span>
                </label>
                {isDefault ? (
                  <span className="text-xs font-medium text-[#5146E5]">Default</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeDefault(model)}
                    className="text-xs font-medium text-gray-500 hover:text-[#5146E5]"
                  >
                    Make default
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Checked models can be picked when generating; the default is used otherwise.
      </p>
    </div>
  );
};

export default MediaModelsField;
