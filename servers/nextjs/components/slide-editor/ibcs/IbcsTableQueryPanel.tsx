"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Kh7Api,
  type Kh7Dimension,
  type Kh7Measure,
  type Kh7Source,
} from "@/app/(presentation-generator)/services/api/kh7";
import type { DataBinding, IbcsChartConfig, IbcsScale } from "@/components/slide-editor/types";
import { fetchIbcsTableMembers } from "@/components/slide-editor/ibcs/fetch";
import { parseIbcsDecimals } from "@/components/slide-editor/ibcs/format";
import {
  defaultIbcsTableColumns,
  ibcsTableToGrid,
  type IbcsTableColumn,
  type IbcsTableMember,
  IBCS_TABLE_VIZ_OPTIONS,
} from "@/components/slide-editor/ibcs/table-columns";
import {
  mergeIbcsConfig,
  previousYear,
  resolveCurrentYear,
  specFromConfig,
} from "@/components/slide-editor/ibcs/spec";

export function IbcsTableQueryPanel({
  binding,
  extraFilters,
  ibcs,
  onApply,
}: {
  binding?: DataBinding | null;
  extraFilters?: DataBinding["filters"];
  ibcs?: IbcsChartConfig | null;
  onApply: (payload: {
    members: IbcsTableMember[];
    binding: DataBinding;
    ibcs: IbcsChartConfig;
    grid: string[][];
  }) => void;
}) {
  const [sources, setSources] = useState<Kh7Source[]>([]);
  const [sourceName, setSourceName] = useState(binding?.query_id ?? "");
  const [dimensions, setDimensions] = useState<Kh7Dimension[]>([]);
  const [measures, setMeasures] = useState<Kh7Measure[]>([]);
  const [measure, setMeasure] = useState(binding?.measures?.[0] ?? ibcs?.measure ?? "");
  const [rowDimension, setRowDimension] = useState(
    binding?.dimensions?.[0] ?? ibcs?.row_dimension ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [yearInput, setYearInput] = useState(resolveCurrentYear(ibcs?.current_year));
  const spec = specFromConfig({ ...ibcs, kind: "table" });
  const year = resolveCurrentYear(yearInput);
  const columns = (ibcs?.columns as IbcsTableColumn[] | undefined) ?? defaultIbcsTableColumns();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await Kh7Api.listSources();
        if (cancelled) return;
        setSources(items);
        if (!sourceName && items[0]) setSourceName(items[0].name);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo listar informes");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sourceName) {
      setMeasures([]);
      setDimensions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const meta = await Kh7Api.metadata(sourceName);
        if (cancelled) return;
        setMeasures(meta.measures);
        setDimensions(meta.dimensions);
        setMeasure((current) =>
          current && meta.measures.some((item) => item.name === current)
            ? current
            : (meta.measures[0]?.name ?? ""),
        );
        setRowDimension((current) =>
          current && meta.dimensions.some((item) => item.name === current)
            ? current
            : (meta.dimensions.find((item) => !/CALYEAR|VERSION|CALMONTH/i.test(item.name))
                ?.name ??
              meta.dimensions[0]?.name ??
              ""),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar metadata");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceName]);

  const load = async () => {
    if (!sourceName || !measure || !rowDimension) return;
    setLoading(true);
    setError(null);
    try {
      const meta = await Kh7Api.metadata(sourceName);
      const fetched = await fetchIbcsTableMembers({
        source: sourceName,
        measure,
        currentYear: year,
        rowDimension,
        spec,
        knownDimensions: meta.dimensions.map((item) => item.name),
        extraFilters: (extraFilters ?? [])
          .filter((item) => (item.values?.length ?? 0) > 0)
          .map((item) => ({
            dimension: String(item.dimension || item.column || ""),
            values: (item.values ?? []).map(String),
          })),
      });
      const measureMeta = meta.measures.find((item) => item.name === measure);
      const source = sources.find((item) => item.name === sourceName);
      const nextIbcs = mergeIbcsConfig(ibcs, {
        kind: "table",
        measure,
        current_year: year,
        row_dimension: rowDimension,
        members: fetched.members,
        columns,
        unit: measureMeta?.unit || fetched.unit || ibcs?.unit || null,
        decimals:
          parseIbcsDecimals(measureMeta?.decimals) ??
          fetched.decimals ??
          ibcs?.decimals ??
          null,
        year_dimension: spec.yearDimension,
        version_dimension: spec.versionDimension,
        version_codes: spec.versionCodes,
      }) as IbcsChartConfig;
      onApply({
        members: fetched.members,
        ibcs: nextIbcs,
        grid: ibcsTableToGrid(fetched.members, columns, {
          scale: nextIbcs.scale,
          scaleLabel: nextIbcs.scale_label,
          decimals: nextIbcs.decimals,
          unit: nextIbcs.unit,
        }),
        binding: {
          source: "kh7",
          query_id: sourceName,
          query_name: source?.description || sourceName,
          dimensions: [rowDimension],
          measures: [measure],
          filters: extraFilters ?? [],
          fetched_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la tabla IBCS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#D6E4FF] bg-[#F0F5FF] px-3 py-2 text-[11px] text-[#2B5797]">
        Elige la dimensión de filas y el ratio. El complemento genera PY, PL, FC, AC y
        las variaciones Δ. AC AY = {year} Real ({spec.versionCodes.actual}), ΔPY ={" "}
        {previousYear(year)} Real, ΔFC = {year} Forecast ({spec.versionCodes.forecast}
        ), ΔPL = {year} Plan ({spec.versionCodes.plan}).
      </div>
      <Field label="Informe">
        <select
          className={inputClass()}
          value={sourceName}
          onChange={(event) => setSourceName(event.target.value)}
        >
          <option value="">Selecciona…</option>
          {sources.map((item) => (
            <option key={item.name} value={item.name}>
              {item.description}
              {item.catalog ? ` · ${item.catalog}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Año actual">
        <input
          className={inputClass()}
          inputMode="numeric"
          maxLength={4}
          value={yearInput}
          onChange={(event) =>
            setYearInput(event.target.value.replace(/\D/g, "").slice(0, 4))
          }
        />
      </Field>
      <Field label="Dimensión (filas)">
        <select
          className={inputClass()}
          value={rowDimension}
          onChange={(event) => setRowDimension(event.target.value)}
        >
          <option value="">Selecciona…</option>
          {dimensions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.caption}
              {item.caption !== item.name ? ` · ${item.name}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ratio">
        <select
          className={inputClass()}
          value={measure}
          onChange={(event) => setMeasure(event.target.value)}
        >
          <option value="">Selecciona…</option>
          {measures.map((item) => (
            <option key={item.name} value={item.name}>
              {item.caption}
              {item.unit ? ` · ${item.unit}` : ""}
            </option>
          ))}
        </select>
      </Field>
      {error ? <div className="text-[12px] text-[#B42318]">{error}</div> : null}
      <button
        type="button"
        className="h-9 rounded-lg bg-[#191919] px-4 text-[12px] font-semibold text-white disabled:opacity-50"
        disabled={!sourceName || !measure || !rowDimension || loading || yearInput.length !== 4}
        onClick={() => void load()}
      >
        {loading ? "Cargando…" : "Cargar tabla IBCS"}
      </button>
    </div>
  );
}

export function IbcsTableColumnsEditor({
  columns,
  onChange,
}: {
  columns: IbcsTableColumn[];
  onChange: (columns: IbcsTableColumn[]) => void;
}) {
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= columns.length) return;
    if (columns[index]?.role === "label" || columns[nextIndex]?.role === "label") {
      return;
    }
    const next = [...columns];
    const current = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = current;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="text-[12px] font-medium text-[#191919]">Columnas</div>
      <p className="text-[11px] text-[#6B6B74]">
        Cambia el visual de cada columna: número, barra, indicador Δ o porcentaje.
      </p>
      <div className="space-y-1">
        {columns.map((column, index) => (
          <div
            key={column.id}
            className="flex items-center gap-2 rounded-lg border border-[#E6E6EA] px-2 py-1.5"
          >
            <input
              type="checkbox"
              checked={column.visible !== false}
              disabled={column.role === "label"}
              onChange={(event) =>
                onChange(
                  columns.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, visible: event.target.checked }
                      : item,
                  ),
                )
              }
            />
            <input
              className="h-8 min-w-0 flex-1 rounded border border-[#E6E6EA] px-2 text-[11px]"
              value={column.label}
              onChange={(event) =>
                onChange(
                  columns.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                )
              }
            />
            {column.role === "label" ? (
              <span className="w-[150px] text-[11px] text-[#6B6B74]">Fila</span>
            ) : (
              <select
                className="h-8 w-[150px] rounded border border-[#E6E6EA] text-[11px]"
                value={column.viz}
                onChange={(event) =>
                  onChange(
                    columns.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, viz: event.target.value as IbcsTableColumn["viz"] }
                        : item,
                    ),
                  )
                }
              >
                {IBCS_TABLE_VIZ_OPTIONS.filter((item) => item.value !== "text").map(
                  (item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ),
                )}
              </select>
            )}
            <div className="flex w-[44px] flex-col">
              <button
                type="button"
                className="h-4 text-[9px] text-[#6B6B74] disabled:opacity-30"
                disabled={index <= 1}
                onClick={() => move(index, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="h-4 text-[9px] text-[#6B6B74] disabled:opacity-30"
                disabled={index === 0 || index === columns.length - 1}
                onClick={() => move(index, 1)}
              >
                ▼
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SCALE_OPTIONS: Array<{ value: IbcsScale; label: string }> = [
  { value: "auto", label: "Automático (K / M)" },
  { value: "none", label: "Sin agrupar" },
  { value: "thousands", label: "Miles (K)" },
  { value: "millions", label: "Millones (M)" },
];

export function IbcsTableFormatEditor({
  ibcs,
  onChange,
}: {
  ibcs?: IbcsChartConfig | null;
  onChange: (patch: Partial<IbcsChartConfig>) => void;
}) {
  const scale = ibcs?.scale ?? "auto";
  const suffixPlaceholder =
    scale === "millions" ? "Millones" : scale === "thousands" ? "Miles" : "M";
  return (
    <div className="space-y-2">
      <div className="text-[12px] font-medium text-[#191919]">Formato</div>
      <Field label="Agrupación">
        <select
          className={inputClass()}
          value={scale}
          onChange={(event) =>
            onChange({ scale: event.target.value as IbcsScale })
          }
        >
          {SCALE_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Sufijo de agrupación">
        <input
          className={inputClass()}
          placeholder={suffixPlaceholder}
          value={ibcs?.scale_label ?? ""}
          onChange={(event) =>
            onChange({ scale_label: event.target.value || null })
          }
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Unidad">
          <input
            className={inputClass()}
            placeholder="EUR, uds"
            value={ibcs?.unit ?? ""}
            onChange={(event) => onChange({ unit: event.target.value || null })}
          />
        </Field>
        <Field label="Decimales">
          <input
            className={inputClass()}
            inputMode="numeric"
            maxLength={1}
            placeholder="auto"
            value={ibcs?.decimals == null ? "" : String(ibcs.decimals)}
            onChange={(event) => {
              const raw = event.target.value.replace(/\D/g, "").slice(0, 1);
              onChange({ decimals: raw === "" ? null : Number(raw) });
            }}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-[12px] font-medium text-[#191919]">
      {label}
      {children}
    </label>
  );
}

function inputClass() {
  return "mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px]";
}
