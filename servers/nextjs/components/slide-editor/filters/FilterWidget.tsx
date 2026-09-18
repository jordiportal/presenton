"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FilterElement, FilterOption } from "@/components/slide-editor/types";
import { MONTH_SHORT, monthKey } from "@/components/slide-editor/filters/filter-model";
import {
  isTreemapCellActive,
  layoutTreemap,
  type TreemapCell,
} from "@/components/slide-editor/filters/treemap-layout";

const ACCENT = "#F97316";

export function FilterWidget({
  element,
  interactive,
  onChange,
}: {
  element: FilterElement;
  interactive: boolean;
  onChange?: (selected: string[]) => void;
}) {
  const options = element.options ?? [];
  const selected = element.selected ?? [];
  const kind = element.filter_kind;
  const accent = element.accent ? `#${element.accent.replace(/^#/, "")}` : ACCENT;

  if (kind === "temporal") {
    return (
      <MonthStrip
        accent={accent}
        interactive={interactive}
        options={options}
        selected={selected}
        onChange={onChange}
      />
    );
  }

  if (kind === "year") {
    return (
      <YearPills
        accent={accent}
        interactive={interactive}
        options={options}
        selected={selected}
        onChange={onChange}
      />
    );
  }

  if (kind === "radio") {
    return (
      <ChipRow
        accent={accent}
        interactive={interactive}
        multiple={false}
        options={options}
        selected={selected}
        onChange={onChange}
      />
    );
  }

  if (kind === "multi") {
    return (
      <ChipRow
        accent={accent}
        interactive={interactive}
        multiple
        options={options}
        selected={selected}
        onChange={onChange}
      />
    );
  }

  if (kind === "dropdown") {
    return (
      <DropdownFilter
        interactive={interactive}
        options={options}
        selected={selected}
        onChange={onChange}
      />
    );
  }

  if (kind === "treemap") {
    return (
      <TreemapFilter
        element={element}
        interactive={interactive}
        onChange={onChange}
      />
    );
  }

  return (
    <SearchFilter
      interactive={interactive}
      options={options}
      selected={selected}
      onChange={onChange}
    />
  );
}

function MonthStrip({
  accent,
  interactive,
  options,
  selected,
  onChange,
}: {
  accent: string;
  interactive: boolean;
  options: FilterOption[];
  selected: string[];
  onChange?: (selected: string[]) => void;
}) {
  const selectedKeys = new Set(selected.map(monthKey));
  return (
    <div className="flex h-full w-full items-stretch overflow-hidden rounded-full border border-[#D0D5DD] bg-white">
      {MONTH_SHORT.map((month, index) => {
        const option =
          options.find((item) => monthKey(item.code) === month.code) ?? month;
        const active = selectedKeys.has(month.code);
        const first = index === 0;
        const last = index === MONTH_SHORT.length - 1;
        return (
          <button
            key={month.code}
            type="button"
            disabled={!interactive}
            className={`min-w-0 flex-1 border-l border-[#E4E7EC] text-[11px] font-semibold uppercase tracking-[0.02em] transition ${
              active ? "text-white" : "text-[#344054] hover:bg-[#F9FAFB]"
            } ${first ? "border-l-0" : ""}`}
            style={{
              background: active ? accent : "transparent",
              borderRadius: active
                ? first
                  ? "999px 0 0 999px"
                  : last
                    ? "0 999px 999px 0"
                    : 0
                : undefined,
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (!interactive) return;
              const code = option.code;
              const next = selected.some((item) => monthKey(item) === month.code)
                ? selected.filter((item) => monthKey(item) !== month.code)
                : [...selected, code];
              onChange?.(next);
            }}
          >
            {month.caption}
          </button>
        );
      })}
    </div>
  );
}

function YearPills({
  accent,
  interactive,
  options,
  selected,
  onChange,
}: {
  accent: string;
  interactive: boolean;
  options: FilterOption[];
  selected: string[];
  onChange?: (selected: string[]) => void;
}) {
  return (
    <div className="flex h-full items-center gap-1">
      {options.map((option) => {
        const active = selected.includes(option.code);
        return (
          <button
            key={option.code}
            type="button"
            disabled={!interactive}
            className={`h-8 min-w-[58px] rounded-full px-3 text-[12px] font-semibold ${
              active ? "text-white" : "bg-[#F2F4F7] text-[#344054]"
            }`}
            style={{ background: active ? "#111827" : undefined }}
            onClick={(event) => {
              event.stopPropagation();
              if (!interactive) return;
              onChange?.(
                active
                  ? selected.filter((item) => item !== option.code)
                  : [...selected, option.code],
              );
            }}
          >
            {option.caption}
          </button>
        );
      })}
      {options.length === 0 ? (
        <span className="text-[11px] text-[#98A2B3]">Configura el año</span>
      ) : null}
      <span className="sr-only">{accent}</span>
    </div>
  );
}

function ChipRow({
  accent,
  interactive,
  multiple,
  options,
  selected,
  onChange,
}: {
  accent: string;
  interactive: boolean;
  multiple: boolean;
  options: FilterOption[];
  selected: string[];
  onChange?: (selected: string[]) => void;
}) {
  if (options.length === 0) {
    return (
      <div className="flex h-full items-center text-[11px] text-[#98A2B3]">
        Doble clic para elegir dimensión
      </div>
    );
  }
  return (
    <div className="flex h-full flex-wrap items-center gap-1.5 overflow-hidden">
      {options.map((option) => {
        const active = selected.includes(option.code);
        return (
          <button
            key={option.code}
            type="button"
            disabled={!interactive}
            className={`h-7 rounded-full border px-3 text-[11px] font-semibold ${
              active
                ? "border-transparent text-white"
                : "border-[#D0D5DD] bg-white text-[#344054]"
            }`}
            style={{ background: active ? accent : undefined }}
            onClick={(event) => {
              event.stopPropagation();
              if (!interactive) return;
              if (multiple) {
                onChange?.(
                  active
                    ? selected.filter((item) => item !== option.code)
                    : [...selected, option.code],
                );
                return;
              }
              onChange?.(active ? [] : [option.code]);
            }}
          >
            {option.caption}
          </button>
        );
      })}
    </div>
  );
}

function DropdownFilter({
  interactive,
  options,
  selected,
  onChange,
}: {
  interactive: boolean;
  options: FilterOption[];
  selected: string[];
  onChange?: (selected: string[]) => void;
}) {
  return (
    <select
      disabled={!interactive}
      className="h-9 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-[12px] text-[#191919]"
      value={selected[0] ?? ""}
      onChange={(event) => {
        event.stopPropagation();
        onChange?.(event.target.value ? [event.target.value] : []);
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <option value="">Todos</option>
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.caption}
        </option>
      ))}
    </select>
  );
}

function SearchFilter({
  interactive,
  options,
  selected,
  onChange,
}: {
  interactive: boolean;
  options: FilterOption[];
  selected: string[];
  onChange?: (selected: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 8);
    return options
      .filter(
        (item) =>
          item.caption.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [options, query]);

  return (
    <div className="flex h-full flex-col justify-center">
      <input
        disabled={!interactive}
        className="h-8 w-full rounded-lg border border-[#D0D5DD] px-3 text-[12px] outline-none"
        placeholder="Buscar y filtrar…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClick={(event) => event.stopPropagation()}
      />
      {query && interactive ? (
        <div className="mt-1 max-h-24 overflow-auto rounded-lg border border-[#ECECF1] bg-white shadow-sm">
          {matches.map((option) => {
            const active = selected.includes(option.code);
            return (
              <button
                key={option.code}
                type="button"
                className={`flex h-7 w-full items-center px-2 text-left text-[11px] ${
                  active ? "bg-[#FFF4ED] font-semibold" : "hover:bg-[#F8F8FA]"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange?.(
                    active
                      ? selected.filter((item) => item !== option.code)
                      : [...selected, option.code],
                  );
                }}
              >
                {option.caption}
              </button>
            );
          })}
          {matches.length === 0 ? (
            <div className="px-2 py-1 text-[11px] text-[#98A2B3]">Sin resultados</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function contrastText(hex: string): string {
  const raw = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(raw.slice(0, 2), 16) || 0;
  const g = Number.parseInt(raw.slice(2, 4), 16) || 0;
  const b = Number.parseInt(raw.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#1F2937" : "#FFFFFF";
}

function cellLabel(cell: TreemapCell): string {
  if (cell.width < 28 || cell.height < 14) return "";
  const maxChars = Math.max(3, Math.floor(cell.width / 7.2));
  if (cell.caption.length <= maxChars) return cell.caption;
  return `${cell.caption.slice(0, Math.max(2, maxChars - 1))}…`;
}

function TreemapFilter({
  element,
  interactive,
  onChange,
}: {
  element: FilterElement;
  interactive: boolean;
  onChange?: (selected: string[]) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const selected = element.selected ?? [];
  const selectedSet = new Set(selected);

  useLayoutEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const readSize = (width: number, height: number) => ({
      width: Math.max(0, Math.round(width)),
      height: Math.max(0, Math.round(height)),
    });
    const sync = () => {
      setBox(readSize(node.clientWidth, node.clientHeight));
    };
    sync();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const boxSize = entry.contentBoxSize?.[0];
      if (boxSize) {
        setBox(readSize(boxSize.inlineSize, boxSize.blockSize));
        return;
      }
      setBox(readSize(entry.contentRect.width, entry.contentRect.height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cells = useMemo(
    () => layoutTreemap(element.nodes ?? [], box.width, box.height),
    [box.height, box.width, element.nodes],
  );

  return (
    <div ref={hostRef} className="h-full w-full overflow-hidden bg-white">
      {box.width > 0 && box.height > 0 ? (
        <svg
          className="block h-full w-full"
          width={box.width}
          height={box.height}
          viewBox={`0 0 ${box.width} ${box.height}`}
          preserveAspectRatio="none"
        >
          {cells.map((cell, index) => {
            const active = isTreemapCellActive(
              cell,
              selectedSet,
              element.nodes,
            );
            const label = cellLabel(cell);
            const textY = cell.header
              ? cell.y + 14
              : cell.y + Math.min(16, cell.height * 0.42);
            return (
              <g
                key={`${cell.depth}-${cell.code}-${index}`}
                opacity={active ? 1 : 0.38}
                style={{ cursor: interactive ? "pointer" : "default" }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!interactive) return;
                  onChange?.(selected[0] === cell.code ? [] : [cell.code]);
                }}
              >
                <rect
                  x={cell.x}
                  y={cell.y}
                  width={Math.max(0, cell.width)}
                  height={Math.max(0, cell.height)}
                  fill={cell.color}
                  stroke="#FFFFFF"
                  strokeWidth={1.2}
                />
                {label ? (
                  <text
                    x={cell.x + 6}
                    y={textY}
                    fill={contrastText(cell.color)}
                    fontSize={cell.header || cell.depth === 0 ? 11 : 10}
                    fontWeight={cell.depth === 0 ? 700 : 600}
                    fontFamily="Inter, Arial, Helvetica, sans-serif"
                  >
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
