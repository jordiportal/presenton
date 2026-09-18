"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Plus, RefreshCw, X } from "lucide-react";
import {
  Kh7Api,
  type Kh7Dimension,
  type Kh7Measure,
  type Kh7Source,
} from "@/app/(presentation-generator)/services/api/kh7";
import type {
  SimulationColumn,
  SimulationColumnPref,
  SimulationConfig,
  SimulationScale,
  SimulationSnapshot,
  SimulationSpec,
} from "@/components/slide-editor/types";
import { SimulationApi } from "@/components/slide-editor/simulation/api";
import {
  SIMULATION_BAND_COLORS,
  SIMULATION_PACK,
  defaultSimulationColumnPrefs,
  defaultSimulationConfig,
  simulationColumnsFor,
  simulationFormatFromConfig,
} from "@/components/slide-editor/simulation/spec";
import { formatSimulationCell } from "@/components/slide-editor/simulation/format";

type Props = {
  simulation?: SimulationConfig | null;
  extraFilters?: SimulationSpec["filters"];
  onChange: (config: SimulationConfig) => void;
};

const SCALE_OPTIONS: Array<{ value: SimulationScale; label: string }> = [
  { value: "none", label: "Sin agrupar" },
  { value: "auto", label: "Automático (K / M)" },
  { value: "thousands", label: "Miles (K)" },
  { value: "millions", label: "Millones (M)" },
];

export function SimulationQueryPanel({ simulation, extraFilters, onChange }: Props) {
  const base = simulation ?? defaultSimulationConfig();
  const spec = base.spec ?? defaultSimulationConfig().spec!;

  const packColumns = useMemo<SimulationColumn[]>(
    () =>
      base.snapshot?.columns?.length
        ? base.snapshot.columns
        : simulationColumnsFor(base.pack),
    [base.pack, base.snapshot?.columns],
  );

  const [sources, setSources] = useState<Kh7Source[]>([]);
  const [dimensions, setDimensions] = useState<Kh7Dimension[]>([]);
  const [measures, setMeasures] = useState<Kh7Measure[]>([]);
  const [incrMeasures, setIncrMeasures] = useState<Kh7Measure[]>([]);
  const [incrDimensions, setIncrDimensions] = useState<Kh7Dimension[]>([]);
  const [sourceName, setSourceName] = useState(spec.source_query ?? "");
  const [rowDimensions, setRowDimensions] = useState<string[]>(
    (spec.row_dimensions ?? []).filter(Boolean),
  );
  const [udsMeasure, setUdsMeasure] = useState(spec.uds_measure ?? "");
  const [vnMeasure, setVnMeasure] = useState(spec.vn_measure ?? "");
  const [year, setYear] = useState(
    spec.current_year ?? String(new Date().getFullYear()),
  );
  const [incrQuery, setIncrQuery] = useState(spec.incr_query ?? "");
  const [incrUdsMeasure, setIncrUdsMeasure] = useState(spec.incr_uds_measure ?? "");
  const [incrVnMeasure, setIncrVnMeasure] = useState(spec.incr_vn_measure ?? "");
  const [monthly, setMonthly] = useState(spec.monthly === true);
  const [monthDimension, setMonthDimension] = useState(
    spec.month_dimension ?? "0CALMONTH2",
  );
  const [workdaysAdjust, setWorkdaysAdjust] = useState(
    spec.workdays_adjust !== false,
  );
  const [holidaysText, setHolidaysText] = useState(
    (spec.holidays ?? []).join(", "),
  );
  const [compare, setCompare] = useState(spec.compare === true);
  const [versionForecast, setVersionForecast] = useState(
    spec.version_forecast ?? "000",
  );
  const [versionPlan, setVersionPlan] = useState(spec.version_plan ?? "001");
  const [columnPrefs, setColumnPrefs] = useState<SimulationColumnPref[]>(
    base.columns?.length ? base.columns : defaultSimulationColumnPrefs(packColumns),
  );
  const [decimals, setDecimals] = useState<number | null>(base.decimals ?? null);
  const [unit, setUnit] = useState(base.unit ?? "");
  const [scale, setScale] = useState<SimulationScale>(base.scale ?? "none");
  const [scaleLabel, setScaleLabel] = useState(base.scale_label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const snapshot = base.snapshot ?? null;
  const workbookId = base.workbook_id ?? null;
  const format = simulationFormatFromConfig({
    decimals,
    unit: unit || null,
    scale,
    scale_label: scaleLabel || null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await Kh7Api.listSources();
        if (!cancelled) setSources(items);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "No se pudo listar informes");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sourceName) {
      setDimensions([]);
      setMeasures([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const meta = await Kh7Api.metadata(sourceName);
        if (cancelled) return;
        setDimensions(meta.dimensions);
        setMeasures(meta.measures);
        setRowDimensions((current) => {
          const valid = current.filter((name) =>
            meta.dimensions.some((item) => item.name === name),
          );
          if (valid.length) return valid;
          const fallback = meta.dimensions.find(
            (item) => !/CALYEAR|VERSION|CALMONTH/i.test(item.name),
          );
          return fallback ? [fallback.name] : [];
        });
        setUdsMeasure((current) =>
          current && meta.measures.some((item) => item.name === current)
            ? current
            : (meta.measures[0]?.name ?? ""),
        );
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "No se pudo cargar metadata");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceName]);

  useEffect(() => {
    if (!incrQuery) {
      setIncrDimensions([]);
      setIncrMeasures([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const meta = await Kh7Api.metadata(incrQuery);
        if (cancelled) return;
        setIncrDimensions(meta.dimensions);
        setIncrMeasures(meta.measures);
      } catch {
        if (!cancelled) {
          setIncrDimensions([]);
          setIncrMeasures([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [incrQuery]);

  const buildSpec = (): SimulationSpec => ({
    ...spec,
    source_query: sourceName || null,
    row_dimensions: rowDimensions.filter(Boolean),
    uds_measure: udsMeasure || null,
    vn_measure: vnMeasure || null,
    year_dimension: spec.year_dimension ?? "0CALYEAR",
    version_dimension: spec.version_dimension ?? "0VERSION",
    version_actual: spec.version_actual ?? "#",
    current_year: year || null,
    incr_query: incrQuery || null,
    incr_row_dimension: incrQuery ? rowDimensions[0] || null : null,
    incr_uds_measure: incrUdsMeasure || null,
    incr_vn_measure: incrVnMeasure || null,
    filters: (extraFilters ?? []).filter((item) => (item.values?.length ?? 0) > 0),
    max_rows: spec.max_rows ?? 60,
    monthly,
    month_dimension: monthDimension || "0CALMONTH2",
    workdays_adjust: workdaysAdjust,
    holidays: holidaysText
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
    compare,
    version_forecast: versionForecast || "000",
    version_plan: versionPlan || "001",
  });

  const makeConfig = (
    nextSnapshot: SimulationSnapshot | null,
    nextSpec?: SimulationSpec,
    nextPrefs?: SimulationColumnPref[],
  ): SimulationConfig => ({
    pack: base.pack || SIMULATION_PACK,
    workbook_id: nextSnapshot?.workbook_id ?? base.workbook_id ?? null,
    spec: nextSpec ?? base.spec ?? buildSpec(),
    snapshot: nextSnapshot,
    unit: unit || null,
    decimals,
    scale,
    scale_label: scaleLabel || null,
    columns: nextPrefs ?? columnPrefs,
  });

  // Persist display preferences (format / columns) without refetching.
  const pushPrefs = (patch: {
    prefs?: SimulationColumnPref[];
    decimals?: number | null;
    unit?: string;
    scale?: SimulationScale;
    scaleLabel?: string;
  }) => {
    onChange({
      pack: base.pack || SIMULATION_PACK,
      workbook_id: base.workbook_id ?? null,
      spec: base.spec ?? buildSpec(),
      snapshot: base.snapshot ?? null,
      unit: (patch.unit ?? unit) || null,
      decimals: patch.decimals !== undefined ? patch.decimals : decimals,
      scale: patch.scale ?? scale,
      scale_label: (patch.scaleLabel ?? scaleLabel) || null,
      columns: patch.prefs ?? columnPrefs,
    });
  };

  const refresh = async () => {
    if (!sourceName || rowDimensions.length === 0 || !udsMeasure) return;
    setLoading(true);
    setError(null);
    try {
      const nextSpec = buildSpec();
      const snap = await SimulationApi.refresh({
        workbook_id: workbookId,
        pack: base.pack || SIMULATION_PACK,
        spec: nextSpec,
      });
      onChange(makeConfig(snap, nextSpec));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo actualizar la simulación",
      );
    } finally {
      setLoading(false);
    }
  };

  const commitOverride = async (
    rowKey: string,
    column: SimulationColumn,
    raw: string,
  ) => {
    if (!workbookId) return;
    const trimmed = raw.trim().replace(",", ".");
    let value: number | null;
    if (trimmed === "") {
      value = null;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return;
      value = column.format === "percent" ? parsed / 100 : parsed;
    }
    try {
      const snap = await SimulationApi.setOverride(workbookId, {
        row_key: rowKey,
        column_id: column.id,
        value,
      });
      onChange(makeConfig(snap));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el override");
    }
  };

  const availableToAdd = dimensions.filter(
    (item) => !rowDimensions.includes(item.name),
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#FFE0B2] bg-[#FFF7ED] px-3 py-2 text-[11px] text-[#9A3412]">
        Simulación del plan de ventas (pack {base.pack || SIMULATION_PACK}). Las
        columnas <b>azules</b> vienen de KH7, las <b>naranjas</b> son editables y las{" "}
        <b>amarillas</b> se calculan. Al editar una celda naranja se recalcula todo y
        se guarda en la base de datos.
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Informe (ZMSCOPA)">
          <select
            className={inputClass()}
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
          >
            <option value="">Selecciona…</option>
            {sources.map((item) => (
              <option key={item.name} value={item.name}>
                {item.description}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Año plan">
          <input
            className={inputClass()}
            inputMode="numeric"
            maxLength={4}
            value={year}
            onChange={(event) =>
              setYear(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
          />
        </Field>
        <Field label="Unidades (UDS)">
          <select
            className={inputClass()}
            value={udsMeasure}
            onChange={(event) => setUdsMeasure(event.target.value)}
          >
            <option value="">Selecciona…</option>
            {measures.map((item) => (
              <option key={item.name} value={item.name}>
                {item.caption}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Venta Neta (VN)">
          <select
            className={inputClass()}
            value={vnMeasure}
            onChange={(event) => setVnMeasure(event.target.value)}
          >
            <option value="">(opcional)</option>
            {measures.map((item) => (
              <option key={item.name} value={item.name}>
                {item.caption}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Incrementos (ZMATINCR)">
          <select
            className={inputClass()}
            value={incrQuery}
            onChange={(event) => setIncrQuery(event.target.value)}
          >
            <option value="">(sin defaults)</option>
            {sources.map((item) => (
              <option key={item.name} value={item.name}>
                {item.description}
              </option>
            ))}
          </select>
        </Field>
        {incrQuery ? (
          <>
            <Field label="% Incr. UDS">
              <select
                className={inputClass()}
                value={incrUdsMeasure}
                onChange={(event) => setIncrUdsMeasure(event.target.value)}
              >
                <option value="">Selecciona…</option>
                {incrMeasures.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.caption}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="% Incr. VN">
              <select
                className={inputClass()}
                value={incrVnMeasure}
                onChange={(event) => setIncrVnMeasure(event.target.value)}
              >
                <option value="">Selecciona…</option>
                {incrMeasures.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.caption}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
      </div>

      {/* Row-dimension hierarchy */}
      <div className="space-y-2 rounded-lg border border-[#ECECF1] p-3">
        <div className="text-[12px] font-medium text-[#191919]">
          Dimensiones de fila (jerarquía)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rowDimensions.map((name, index) => {
            const caption =
              dimensions.find((item) => item.name === name)?.caption ?? name;
            return (
              <span
                key={name}
                className="flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-medium text-[#3730A3]"
              >
                <span className="text-[9px] text-[#6366F1]">{index + 1}.</span>
                {caption}
                <button
                  type="button"
                  aria-label={`Quitar ${caption}`}
                  className="text-[#6366F1] hover:text-[#312E81]"
                  onClick={() =>
                    setRowDimensions((current) =>
                      current.filter((item) => item !== name),
                    )
                  }
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          {rowDimensions.length === 0 ? (
            <span className="text-[11px] text-[#98A2B3]">
              Añade al menos una dimensión.
            </span>
          ) : null}
        </div>
        {availableToAdd.length > 0 ? (
          <div className="flex items-center gap-2">
            <Plus size={13} className="text-[#98A2B3]" />
            <select
              className="h-8 flex-1 rounded-lg border border-[#E6E6EA] bg-white px-2 text-[12px]"
              value=""
              onChange={(event) => {
                const value = event.target.value;
                if (value) setRowDimensions((current) => [...current, value]);
              }}
            >
              <option value="">Añadir dimensión…</option>
              {availableToAdd.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.caption}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex items-center gap-2 border-t border-[#F2F4F7] pt-2">
          <label className="flex items-center gap-2 text-[12px] font-medium text-[#191919]">
            <input
              type="checkbox"
              checked={monthly}
              onChange={(event) => setMonthly(event.target.checked)}
            />
            Reparto mensual (Simu ENE…DIC)
          </label>
          {monthly ? (
            <select
              className="h-7 rounded-lg border border-[#E6E6EA] bg-white px-2 text-[11px]"
              value={monthDimension}
              onChange={(event) => setMonthDimension(event.target.value)}
            >
              {dimensions
                .filter((item) => /MONTH|MES/i.test(item.name))
                .map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.caption}
                  </option>
                ))}
              {dimensions.some((item) => /MONTH|MES/i.test(item.name)) ? null : (
                <option value={monthDimension}>{monthDimension}</option>
              )}
            </select>
          ) : null}
        </div>
        {monthly ? (
          <div className="space-y-2">
            <p className="text-[10px] text-[#98A2B3]">
              Distribuye las unidades simuladas por mes según el peso histórico de
              cada grano (peso plan normalizado).
            </p>
            <label className="flex items-center gap-2 text-[11px] font-medium text-[#191919]">
              <input
                type="checkbox"
                checked={workdaysAdjust}
                onChange={(event) => setWorkdaysAdjust(event.target.checked)}
              />
              Ajustar por días laborables (NETWORKDAYS NY/AY)
            </label>
            {workdaysAdjust ? (
              <Field label="Festivos (YYYY-MM-DD, separados por coma)">
                <input
                  className={inputClass()}
                  placeholder="2027-01-01, 2027-01-06, …"
                  value={holidaysText}
                  onChange={(event) => setHolidaysText(event.target.value)}
                />
              </Field>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Comparison vs proposal */}
      <div className="space-y-2 rounded-lg border border-[#ECECF1] p-3">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[#191919]">
          <input
            type="checkbox"
            checked={compare}
            onChange={(event) => setCompare(event.target.checked)}
          />
          Comparar vs propuesta (Previsión / Dif VN)
        </label>
        {compare ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Versión Previsión">
                <input
                  className={inputClass()}
                  value={versionForecast}
                  onChange={(event) => setVersionForecast(event.target.value)}
                />
              </Field>
              <Field label="Versión Propuesta/Objetivo">
                <input
                  className={inputClass()}
                  value={versionPlan}
                  onChange={(event) => setVersionPlan(event.target.value)}
                />
              </Field>
            </div>
            <p className="text-[10px] text-[#98A2B3]">
              Añade Previsión (uds versión {versionForecast || "000"}) y Dif VN Simu
              vs Propuesta (VN versión {versionPlan || "001"}). Requiere seleccionar
              la medida de Venta Neta.
            </p>
          </>
        ) : null}
      </div>

      {incrDimensions.length > 0 ? (
        <p className="text-[10px] text-[#98A2B3]">
          Incrementos casados por caption con la primera dimensión de filas.
        </p>
      ) : null}

      {error ? <div className="text-[12px] text-[#B42318]">{error}</div> : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-lg bg-[#191919] px-4 text-[12px] font-semibold text-white disabled:opacity-50"
          disabled={
            !sourceName || rowDimensions.length === 0 || !udsMeasure || loading
          }
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          {loading ? "Cargando…" : workbookId ? "Actualizar datos" : "Cargar datos"}
        </button>
        {workbookId ? (
          <a
            className="flex h-9 items-center gap-2 rounded-lg border border-[#E6E6EA] px-4 text-[12px] font-semibold text-[#191919] hover:bg-[#F7F7FA]"
            href={SimulationApi.exportUrl(workbookId)}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={14} />
            Exportar .xlsx
          </a>
        ) : null}
      </div>

      <SimulationFormatEditor
        decimals={decimals}
        unit={unit}
        scale={scale}
        scaleLabel={scaleLabel}
        onChange={(patch) => {
          if (patch.decimals !== undefined) setDecimals(patch.decimals);
          if (patch.unit !== undefined) setUnit(patch.unit);
          if (patch.scale !== undefined) setScale(patch.scale);
          if (patch.scaleLabel !== undefined) setScaleLabel(patch.scaleLabel);
          pushPrefs(patch);
        }}
      />

      <SimulationColumnsEditor
        columns={packColumns}
        prefs={columnPrefs}
        onChange={(prefs) => {
          setColumnPrefs(prefs);
          pushPrefs({ prefs });
        }}
      />

      <SimulationMatrixEditor
        snapshot={snapshot}
        format={format}
        editable={Boolean(workbookId)}
        onCommit={commitOverride}
      />
    </div>
  );
}

function SimulationFormatEditor({
  decimals,
  unit,
  scale,
  scaleLabel,
  onChange,
}: {
  decimals: number | null;
  unit: string;
  scale: SimulationScale;
  scaleLabel: string;
  onChange: (patch: {
    decimals?: number | null;
    unit?: string;
    scale?: SimulationScale;
    scaleLabel?: string;
  }) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[#ECECF1] p-3">
      <div className="text-[12px] font-medium text-[#191919]">Formato</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Agrupación">
          <select
            className={inputClass()}
            value={scale}
            onChange={(event) =>
              onChange({ scale: event.target.value as SimulationScale })
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
            placeholder="M, K…"
            value={scaleLabel}
            onChange={(event) => onChange({ scaleLabel: event.target.value })}
          />
        </Field>
        <Field label="Unidad">
          <input
            className={inputClass()}
            placeholder="EUR, uds"
            value={unit}
            onChange={(event) => onChange({ unit: event.target.value })}
          />
        </Field>
        <Field label="Decimales">
          <input
            className={inputClass()}
            inputMode="numeric"
            maxLength={1}
            placeholder="auto"
            value={decimals == null ? "" : String(decimals)}
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

function SimulationColumnsEditor({
  columns,
  prefs,
  onChange,
}: {
  columns: SimulationColumn[];
  prefs: SimulationColumnPref[];
  onChange: (prefs: SimulationColumnPref[]) => void;
}) {
  // Order prefs to match current pref order, defaulting to pack order.
  const byId = new Map(columns.map((column) => [column.id, column]));
  const ordered: SimulationColumnPref[] = [];
  const seen = new Set<string>();
  for (const pref of prefs) {
    if (byId.has(pref.id) && !seen.has(pref.id)) {
      seen.add(pref.id);
      ordered.push(pref);
    }
  }
  for (const column of columns) {
    if (!seen.has(column.id)) {
      ordered.push({ id: column.id, label: column.label, visible: true });
    }
  }

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const a = byId.get(ordered[index].id);
    const b = byId.get(ordered[target].id);
    if (a?.kind === "label" || b?.kind === "label") return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const patch = (id: string, change: Partial<SimulationColumnPref>) => {
    onChange(
      ordered.map((pref) => (pref.id === id ? { ...pref, ...change } : pref)),
    );
  };

  return (
    <div className="space-y-2 rounded-lg border border-[#ECECF1] p-3">
      <div className="text-[12px] font-medium text-[#191919]">Columnas</div>
      <p className="text-[11px] text-[#6B6B74]">
        Muestra/oculta, renombra y reordena las columnas del visual.
      </p>
      <div className="space-y-1">
        {ordered.map((pref, index) => {
          const column = byId.get(pref.id);
          if (!column) return null;
          const isLabel = column.kind === "label";
          return (
            <div
              key={pref.id}
              className="flex items-center gap-2 rounded-lg border border-[#E6E6EA] px-2 py-1.5"
              style={{ backgroundColor: SIMULATION_BAND_COLORS[column.kind] }}
            >
              <input
                type="checkbox"
                checked={pref.visible !== false}
                disabled={isLabel}
                onChange={(event) => patch(pref.id, { visible: event.target.checked })}
              />
              <input
                className="h-8 min-w-0 flex-1 rounded border border-[#E6E6EA] bg-white px-2 text-[11px]"
                value={pref.label ?? ""}
                placeholder={column.label || column.id}
                onChange={(event) => patch(pref.id, { label: event.target.value })}
              />
              <span className="w-[70px] text-[10px] uppercase text-[#98A2B3]">
                {column.kind}
              </span>
              <div className="flex w-[36px] flex-col">
                <button
                  type="button"
                  className="h-4 text-[9px] text-[#6B6B74] disabled:opacity-30"
                  disabled={index <= 1 || isLabel}
                  onClick={() => move(index, -1)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="h-4 text-[9px] text-[#6B6B74] disabled:opacity-30"
                  disabled={index === 0 || index === ordered.length - 1 || isLabel}
                  onClick={() => move(index, 1)}
                >
                  ▼
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SimulationMatrixEditor({
  snapshot,
  format,
  editable,
  onCommit,
}: {
  snapshot: SimulationSnapshot | null;
  format: ReturnType<typeof simulationFormatFromConfig>;
  editable: boolean;
  onCommit: (rowKey: string, column: SimulationColumn, raw: string) => void;
}) {
  const columns = useMemo(
    () =>
      snapshot?.columns?.length
        ? snapshot.columns
        : simulationColumnsFor(snapshot?.pack),
    [snapshot?.columns, snapshot?.pack],
  );
  const rows = snapshot?.rows ?? [];
  const totals = snapshot?.totals ?? {};

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#E6E6EA] px-4 py-6 text-center text-[12px] text-[#98A2B3]">
        Configura el informe y pulsa «Cargar datos» para generar la matriz.
      </div>
    );
  }

  const editValue = (column: SimulationColumn, value: number): string => {
    if (column.format === "percent") return String(Math.round(value * 1000) / 10);
    return String(Math.round(value * 100) / 100);
  };

  return (
    <div className="overflow-auto rounded-lg border border-[#ECECF1]">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className="sticky top-0 z-10 border-b border-[#E4E7EC] px-2 py-1.5 font-semibold text-[#344054]"
                style={{
                  backgroundColor: SIMULATION_BAND_COLORS[column.kind],
                  textAlign: column.kind === "label" ? "left" : "right",
                }}
              >
                {column.label || (column.kind === "label" ? "" : column.id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.row_key}>
              {columns.map((column) => {
                if (column.kind === "label") {
                  return (
                    <td
                      key={column.id}
                      className="whitespace-nowrap border-b border-[#F2F4F7] px-2 py-1 text-left text-[#101323]"
                    >
                      {row.label || row.row_key}
                    </td>
                  );
                }
                const value = Number(row.values?.[column.id] ?? 0);
                if (column.kind === "input" && editable) {
                  return (
                    <td
                      key={column.id}
                      className="border-b border-[#F2F4F7] px-1 py-0.5 text-right"
                      style={{ backgroundColor: SIMULATION_BAND_COLORS.input }}
                    >
                      <input
                        className="h-6 w-full min-w-[56px] bg-transparent text-right text-[11px] font-semibold text-[#B54708] outline-none"
                        defaultValue={editValue(column, value)}
                        onBlur={(event) =>
                          onCommit(row.row_key, column, event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            (event.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </td>
                  );
                }
                return (
                  <td
                    key={column.id}
                    className="border-b border-[#F2F4F7] px-2 py-1 text-right text-[#101323]"
                    style={{ backgroundColor: SIMULATION_BAND_COLORS[column.kind] }}
                  >
                    {formatSimulationCell(column, value, format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            {columns.map((column) => (
              <td
                key={column.id}
                className="border-t-2 border-[#98A2B3] px-2 py-1 font-bold text-[#101323]"
                style={{
                  textAlign: column.kind === "label" ? "left" : "right",
                  backgroundColor: "#F9FAFB",
                }}
              >
                {column.kind === "label"
                  ? "Total"
                  : formatSimulationCell(
                      column,
                      Number(totals[column.id] ?? 0),
                      format,
                    )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-[#191919]">
      {label}
      {children}
    </label>
  );
}

function inputClass() {
  return "mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px]";
}
