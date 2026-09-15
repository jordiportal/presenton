"use client";

import {
  ArrowRight,
  Circle,
  ChevronsRight,
  Filter,
  Repeat2,
  Rows3,
  Triangle,
  type LucideIcon,
} from "lucide-react";
import {
  LIST_INFOGRAPHIC_OPTIONS,
  type ListInfographicType,
} from "@/components/slide-editor/infographics/list-to-infographic";

const INFOGRAPHIC_OPTION_ICONS: Record<ListInfographicType, LucideIcon> = {
  pyramid: Triangle,
  conversion_funnel: Filter,
  staircase: Rows3,
  chevron_process: ChevronsRight,
  stair_step_blocks: Rows3,
  radial_cycle: Repeat2,
  timeline: ArrowRight,
  segmented_wheel: Circle,
};

export function InfographicTypeOptions({
  selectedType,
  onChange,
}: {
  selectedType?: ListInfographicType | null;
  onChange: (type: ListInfographicType) => void;
}) {
  return (
    <>
      {LIST_INFOGRAPHIC_OPTIONS.map((option) => {
        const Icon = INFOGRAPHIC_OPTION_ICONS[option.type];
        const selected = option.type === selectedType;
        return (
          <button
            key={option.type}
            type="button"
            aria-pressed={selected}
            className={`flex h-8 w-full items-center gap-2 rounded-md border-0 px-2 text-left text-[12px] font-semibold ${
              selected
                ? "bg-[#F4F1FF] text-[#7C3AED]"
                : "bg-transparent text-[#111827] hover:bg-[#F3F4F6]"
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(option.type)}
          >
            <Icon size={16} strokeWidth={2.1} aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </>
  );
}
