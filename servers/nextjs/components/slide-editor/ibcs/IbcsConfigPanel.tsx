"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Kh7Api,
  type Kh7Dimension,
  type Kh7DimensionValue,
} from "@/app/(presentation-generator)/services/api/kh7";
import type {
  ChartElement,
  IbcsChartConfig,
  IbcsScale,
  IbcsVarianceBaseline,
  IbcsVarianceRow,
} from "@/components/slide-editor/types";
import {
  IBCS_COLUMN_OVERLAY_DEFAULT,
  IBCS_COLUMN_VARIANCE_DEFAULT,
  IBCS_DEFAULT_BAR_WIDTH,
  IBCS_KPI_PIN,
  clampIbcsBarWidth,
  mergeIbcsConfig,
  normalizeVarianceRows,
  specFromConfig,
} from "@/components/slide-editor/ibcs/spec";

const BASELINE_OPTIONS: Array<{ value: IbcsVarianceBaseline; label: string }> = [
  { value: "py", label: "Año anterior (ΔPY)" },
  { value: "pl", label: "Plan (ΔPL)" },
  { value: "fc", label: "Forecast (ΔFC)" },
];

const SCALE_OPTIONS: Array<{ value: IbcsScale; label: string }> = [
  { value: "auto", label: "Automático (K / M)" },
  { value: "none", label: "Sin agrupar" },
  { value: "thousands", label: "Miles (K)" },
  { value: "millions", label: "Millones (M)" },
];

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

function inputClassName() {
  return "mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px]";
}

export function IbcsConfigPanel({
  chart,
  onChange,
}: {
  chart: ChartElement;
  onChange: (chart: ChartElement) => void;
}) {
  const ibcs = chart.ibcs;
  const spec = specFromConfig(ibcs);
  const source = chart.data_binding?.query_id ?? "";
  const [dimensions, setDimensions] = useState<Kh7Dimension[]>([]);
  const [versionValues, setVersionValues] = useState<Kh7DimensionValue[]>([]);

  useEffect(() => {
    if (!source) {
      setDimensions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const meta = await Kh7Api.metadata(source);
        if (!cancelled) setDimensions(meta.dimensions);
      } catch {
        if (!cancelled) setDimensions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    if (!source || !spec.versionDimension) {
      setVersionValues([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const values = await Kh7Api.dimensionValues(source, spec.versionDimension);
        if (!cancelled) setVersionValues(values);
      } catch {
        if (!cancelled) setVersionValues([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, spec.versionDimension]);

  const patchIbcs = (patch: Partial<IbcsChartConfig>) => {
    onChange({
      ...chart,
      ibcs: mergeIbcsConfig(ibcs, patch) as IbcsChartConfig,
    });
  };

  const dimensionOptions = useMemo(() => {
    const names = new Set(dimensions.map((item) => item.name));
    const extras = [spec.yearDimension, spec.versionDimension].filter(
      (name) => name && !names.has(name),
    );
    return [
      ...dimensions,
      ...extras.map((name) => ({ name, caption: name })),
    ];
  }, [dimensions, spec.yearDimension, spec.versionDimension]);

  const barWidth = clampIbcsBarWidth(ibcs?.bar_width ?? IBCS_DEFAULT_BAR_WIDTH);
  const scale = ibcs?.scale ?? "auto";
  const suffixPlaceholder =
    scale === "millions" ? "Millones" : scale === "thousands" ? "Miles" : "M";
  const isColumn =
    ibcs?.kind === "column" || chart.chart_type === "ibcs_column";
  const overlayBaseline = ibcs?.overlay_baseline ?? IBCS_COLUMN_OVERLAY_DEFAULT;
  const varianceRows = normalizeVarianceRows(
    ibcs?.variance_rows ?? IBCS_COLUMN_VARIANCE_DEFAULT,
  );
  const setVarianceRows = (rows: IbcsVarianceRow[]) =>
    patchIbcs({ variance_rows: rows });

  return (
    <div className="space-y-3">
      {isColumn ? (
        <>
          <Field label="Δ integrado en la columna (overlay)">
            <select
              className={inputClassName()}
              value={overlayBaseline}
              onChange={(event) =>
                patchIbcs({
                  overlay_baseline: event.target.value as IbcsVarianceBaseline,
                })
              }
            >
              {BASELINE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#191919]">
                Filas de varianza (%)
              </span>
              {varianceRows.length < 3 ? (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-[#2B5797]"
                  onClick={() =>
                    setVarianceRows([
                      ...varianceRows,
                      { baseline: "pl", style: "solid", label: null },
                    ])
                  }
                >
                  + Añadir
                </button>
              ) : null}
            </div>
            <p className="text-[11px] text-[#6B6B74]">
              De abajo (junto a las columnas) hacia arriba. Línea sólida o discontinua.
            </p>
            {varianceRows.map((row, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg border border-[#E6E6EA] px-2 py-1.5"
              >
                <select
                  className="h-8 w-[120px] rounded border border-[#E6E6EA] text-[11px]"
                  value={row.baseline}
                  onChange={(event) =>
                    setVarianceRows(
                      varianceRows.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              baseline: event.target.value as IbcsVarianceBaseline,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  {BASELINE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  className="h-8 w-[92px] rounded border border-[#E6E6EA] text-[11px]"
                  value={row.style}
                  onChange={(event) =>
                    setVarianceRows(
                      varianceRows.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              style: event.target.value as "solid" | "dashed",
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="solid">Sólida</option>
                  <option value="dashed">Discontinua</option>
                </select>
                <input
                  className="h-8 min-w-0 flex-1 rounded border border-[#E6E6EA] px-2 text-[11px]"
                  placeholder={`Δ${row.baseline.toUpperCase()}%`}
                  value={row.label ?? ""}
                  onChange={(event) =>
                    setVarianceRows(
                      varianceRows.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, label: event.target.value || null }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="text-[11px] text-[#B42318]"
                  onClick={() =>
                    setVarianceRows(
                      varianceRows.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[12px] font-medium text-[#191919]">
            <input
              type="checkbox"
              checked={ibcs?.show_total !== false}
              onChange={(event) => patchIbcs({ show_total: event.target.checked })}
            />
            Mostrar columna Total
          </label>
        </>
      ) : (
        <Field label="Pin vs">
          <select
            className={inputClassName()}
            value={ibcs?.pin_vs ?? IBCS_KPI_PIN.pinVs}
            onChange={(event) =>
              patchIbcs({ pin_vs: event.target.value as "py" | "pl" | "fc" })
            }
          >
            <option value="fc">Forecast (ΔFC)</option>
            <option value="pl">Plan (ΔPL)</option>
            <option value="py">Año anterior (ΔPY)</option>
          </select>
        </Field>
      )}

      <Field label="Agrupación">
        <select
          className={inputClassName()}
          value={scale}
          onChange={(event) =>
            patchIbcs({ scale: event.target.value as IbcsScale })
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
          className={inputClassName()}
          placeholder={suffixPlaceholder}
          value={ibcs?.scale_label ?? ""}
          onChange={(event) =>
            patchIbcs({ scale_label: event.target.value || null })
          }
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Unidad">
          <input
            className={inputClassName()}
            placeholder="EUR, uds, %"
            value={ibcs?.unit ?? ""}
            onChange={(event) => patchIbcs({ unit: event.target.value || null })}
          />
        </Field>
        <Field label="Decimales">
          <input
            className={inputClassName()}
            inputMode="numeric"
            maxLength={1}
            placeholder="auto"
            value={ibcs?.decimals == null ? "" : String(ibcs.decimals)}
            onChange={(event) => {
              const raw = event.target.value.replace(/\D/g, "").slice(0, 1);
              patchIbcs({
                decimals: raw === "" ? null : Number(raw),
              });
            }}
          />
        </Field>
      </div>

      {isColumn ? null : (
        <label className="block text-[12px] font-medium text-[#191919]">
          Ancho de columna
          <input
            className="mt-2 w-full accent-[#191919]"
            max={28}
            min={8}
            step={0.5}
            type="range"
            value={barWidth}
            onChange={(event) =>
              patchIbcs({ bar_width: Number(event.target.value) })
            }
          />
          <div className="mt-1 flex justify-between text-[11px] font-normal text-[#6B6B74]">
            <span>Estrecha</span>
            <span>{barWidth.toFixed(1)}%</span>
            <span>Ancha</span>
          </div>
        </label>
      )}

      <div className="border-t border-[#E6E6EA] pt-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B6B74]">
          Emparejamiento filtros / dimensiones
        </div>
        <div className="space-y-3">
          <Field label="Dimensión año (AC / PY)">
            <DimensionSelect
              options={dimensionOptions}
              value={spec.yearDimension}
              onChange={(year_dimension) => patchIbcs({ year_dimension })}
            />
          </Field>
          <Field label="Dimensión versión (AC / FC / PL)">
            <DimensionSelect
              options={dimensionOptions}
              value={spec.versionDimension}
              onChange={(version_dimension) => patchIbcs({ version_dimension })}
            />
          </Field>
          <Field label="Código Real (AC, PY)">
            <VersionCodeSelect
              options={versionValues}
              value={spec.versionCodes.actual}
              onChange={(actual) =>
                patchIbcs({
                  version_codes: { ...ibcs?.version_codes, actual },
                })
              }
            />
          </Field>
          <Field label="Código Forecast (FC)">
            <VersionCodeSelect
              options={versionValues}
              value={spec.versionCodes.forecast}
              onChange={(forecast) =>
                patchIbcs({
                  version_codes: { ...ibcs?.version_codes, forecast },
                })
              }
            />
          </Field>
          <Field label="Código Plan (PL)">
            <VersionCodeSelect
              options={versionValues}
              value={spec.versionCodes.plan}
              onChange={(plan) =>
                patchIbcs({
                  version_codes: { ...ibcs?.version_codes, plan },
                })
              }
            />
          </Field>
        </div>
        <p className="mt-2 text-[11px] text-[#6B6B74]">
          Estos códigos se aplican al cargar el KPI o al refrescar los filtros de
          la diapositiva.
        </p>
      </div>
    </div>
  );
}

function DimensionSelect({
  options,
  value,
  onChange,
}: {
  options: Kh7Dimension[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length === 0) {
    return (
      <input
        className={inputClassName()}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <select
      className={inputClassName()}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((item) => (
        <option key={item.name} value={item.name}>
          {item.caption}
          {item.caption !== item.name ? ` · ${item.name}` : ""}
        </option>
      ))}
    </select>
  );
}

function VersionCodeSelect({
  options,
  value,
  onChange,
}: {
  options: Kh7DimensionValue[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length === 0) {
    return (
      <input
        className={inputClassName()}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  const known = options.some((item) => item.code === value);
  return (
    <select
      className={inputClassName()}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {known ? null : <option value={value}>{value}</option>}
      {options.map((item) => (
        <option key={item.code} value={item.code}>
          {item.caption}
          {item.caption !== item.code ? ` · ${item.code}` : ""}
        </option>
      ))}
    </select>
  );
}
