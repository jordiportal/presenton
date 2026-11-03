"use client";

import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { ImagesApi } from "@/app/(presentation-generator)/services/api/images";
import { VideosApi } from "@/app/(presentation-generator)/services/api/videos";
import { cn } from "@/lib/utils";

export type MediaModels = {
  default: string;
  models: string[];
  /** True when the user can choose between more than one model. */
  selectable: boolean;
};

const EMPTY: MediaModels = { default: "", models: [], selectable: false };
const cache: Partial<Record<"image" | "video", Promise<MediaModels>>> = {};

function load(kind: "image" | "video"): Promise<MediaModels> {
  cache[kind] ??= (
    kind === "image"
      ? ImagesApi.getImageModels().then((o) => ({
          default: o.default,
          models: o.models,
          selectable: o.selectable && o.models.length > 1,
        }))
      : VideosApi.getCapabilities().then((o) => ({
          default: o.default || o.model,
          models: o.models?.length ? o.models : o.model ? [o.model] : [],
          selectable: (o.models?.length ?? 0) > 1,
        }))
  ).catch(() => {
    delete cache[kind];
    return EMPTY;
  });
  return cache[kind]!;
}

/** Models enabled in Settings; the list is read once per page load. */
export function useMediaModels(kind: "image" | "video"): MediaModels {
  const [models, setModels] = useState<MediaModels>(EMPTY);
  useEffect(() => {
    let alive = true;
    void load(kind).then((next) => {
      if (alive) setModels(next);
    });
    return () => {
      alive = false;
    };
  }, [kind]);
  return models;
}

type MediaModelSelectProps = {
  models: MediaModels;
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  className?: string;
};

/** Shows the model that will be used; a picker only when alternatives exist. */
export function MediaModelSelect({ models, value, onChange, disabled, className }: MediaModelSelectProps) {
  if (!models.default) return null;
  const current = value || models.default;
  const label = (model: string) => (model === models.default ? `${model} (default)` : model);

  return (
    <label
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[12px] text-[#4B5563]",
        className,
      )}
      title="Generation model"
    >
      <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {models.selectable ? (
        <select
          value={current}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === models.default ? "" : event.target.value)}
          aria-label="Generation model"
          className="min-w-0 flex-1 truncate rounded-[6px] border border-[#E7E8EC] bg-white px-1.5 py-1 text-[12px] text-[#191919] outline-none focus:border-[#7A5AF8] disabled:opacity-60"
        >
          {models.models.map((model) => (
            <option key={model} value={model}>
              {label(model)}
            </option>
          ))}
        </select>
      ) : (
        <span className="truncate">{models.default}</span>
      )}
    </label>
  );
}
