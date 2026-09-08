import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  MoreVertical,
  Plus,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import type { TableSlideElement } from "@/components/slide-editor/state/state";
import {
  setTableRowsFromStrings,
  tableRowsAsStrings,
} from "@/components/slide-editor/model/element-model";
import { Kh7QueryPanel } from "@/components/slide-editor/data/Kh7QueryPanel";
import { tableGridFromExecute } from "@/app/(presentation-generator)/services/api/kh7";
import {
  ADVANCED_TABLE_MAX_COLUMNS,
  ADVANCED_TABLE_MAX_ROWS,
  tableColumnLimit,
  tableRowLimit,
} from "@/components/slide-editor/tables/table-style";

const DATA_MODAL_MAX_HEIGHT = "min(650px, calc(100dvh - 32px))";

export function TableDataEditorPopover({
  table,
  tablePath,
  onChange,
  onClose,
}: {
  table: TableSlideElement;
  tablePath: string;
  onChange: (table: TableSlideElement) => void;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <TableDataModal
      table={table}
      tablePath={tablePath}
      onChange={onChange}
      onClose={onClose}
    />,
    document.body,
  );
}

function TableDataModal({
  table,
  tablePath,
  onChange,
  onClose,
}: {
  table: TableSlideElement;
  tablePath: string;
  onChange: (table: TableSlideElement) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TableSlideElement>(() => table);
  const [dataTab, setDataTab] = useState<"manual" | "kh7">(
    table.data_binding?.source === "kh7" || table.data_binding?.source === "mock"
      ? "kh7"
      : "manual",
  );
  const rows = normalizeGrid(tableRowsAsStrings(draft));
  const maxColumns = tableColumnLimit(draft);
  const maxRows = tableRowLimit(draft);

  const commitGrid = (nextRows: string[][]) => {
    setDraft((current) => setTableRowsFromStrings(current, nextRows));
  };

  return (
    <div
      data-inline-edit-ignore="true"
      className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/35 p-4 pr-[72px] font-syne"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="relative flex w-full max-w-[1080px] flex-col overflow-visible"
        style={{
          height: DATA_MODAL_MAX_HEIGHT,
          maxHeight: DATA_MODAL_MAX_HEIGHT,
        }}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_rgba(16,24,40,0.24)]">
          <header className="flex h-[70px] shrink-0 items-center justify-between border-b border-[#ECECF1] px-5">
            <div>
              <h2 className="text-[15px] font-semibold text-[#191919]">
                Edit Data Table
              </h2>
              <p className="mt-1 text-[11px] text-[#8B8B94]">
                Select a column and edit the table data directly
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-full border border-[#E6E6EA] bg-white px-4 text-[12px] font-semibold text-[#191919] transition hover:bg-[#F7F7FA]"
                onClick={() => {
                  commitGrid(clearedGrid(rows));
                  setDraft((current) => ({ ...current, data_binding: null }));
                }}
              >
                <Trash2 size={14} strokeWidth={2} />
                Clear data
              </button>
              <button
                type="button"
                className="h-8 min-w-[76px] rounded-full bg-[linear-gradient(100deg,#FFE6A6_0%,#D8B4FE_100%)] px-5 text-[12px] font-semibold text-[#191919] transition hover:brightness-95"
                onClick={() => {
                  onChange(draft);
                  onClose();
                }}
              >
                Save
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="min-h-0 w-[255px] shrink-0 overflow-y-auto overscroll-contain border-r border-[#ECECF1] px-4 py-4 hide-scrollbar">
              <label className="mb-2 block text-[12px] font-medium text-[#191919]">
                Table
              </label>
              <div className="flex h-9 items-center gap-2 rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px] font-medium text-[#191919]">
                <Table2 size={15} strokeWidth={2} />
                Advanced Table
              </div>
              <div
                className="relative mt-4 overflow-hidden rounded-lg border border-[#ECECF1] bg-[#F8F8FA] p-3"
                style={{
                  backgroundImage: "url('/card_bg.svg')",
                  backgroundPosition: "center",
                  backgroundSize: "100% 100%",
                }}
              >
                <TablePreview rows={rows} />
              </div>
            </aside>

            <main className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain px-8 py-5">
              <div className="mb-4 flex gap-1 rounded-full bg-[#F4F4F7] p-1 w-fit">
                <button
                  type="button"
                  className={`h-7 rounded-full px-3 text-[11px] font-semibold ${
                    dataTab === "manual"
                      ? "bg-white text-[#191919] shadow-sm"
                      : "text-[#6B6B74]"
                  }`}
                  onClick={() => setDataTab("manual")}
                >
                  Manual
                </button>
                <button
                  type="button"
                  className={`h-7 rounded-full px-3 text-[11px] font-semibold ${
                    dataTab === "kh7"
                      ? "bg-white text-[#191919] shadow-sm"
                      : "text-[#6B6B74]"
                  }`}
                  onClick={() => setDataTab("kh7")}
                >
                  KH7 query
                </button>
              </div>
              {dataTab === "kh7" ? (
                <div className="mb-5">
                  <Kh7QueryPanel
                    binding={draft.data_binding}
                    onApply={(result, nextBinding) => {
                      const grid = tableGridFromExecute(result);
                      setDraft((current) => {
                        const next = setTableRowsFromStrings(current, [
                          grid.columns,
                          ...grid.rows,
                        ]);
                        const rowCount = grid.rows.length + 1;
                        const columnCount = Math.max(1, grid.columns.length);
                        return {
                          ...next,
                          data_binding: nextBinding,
                          max_columns: Math.max(
                            tableColumnLimit(current),
                            columnCount,
                            ADVANCED_TABLE_MAX_COLUMNS,
                          ),
                          max_rows: Math.max(
                            tableRowLimit(current),
                            rowCount,
                            ADVANCED_TABLE_MAX_ROWS,
                          ),
                          size: {
                            width: current.size?.width ?? 1120,
                            height: Math.min(
                              620,
                              Math.max(
                                current.size?.height ?? 320,
                                28 + rowCount * 24,
                              ),
                            ),
                          },
                        };
                      });
                    }}
                  />
                </div>
              ) : null}
              <EditableTableGrid
                maxColumns={maxColumns}
                maxRows={maxRows}
                rows={rows}
                tablePath={tablePath}
                onUpdate={commitGrid}
              />
            </main>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close data editor"
          className="absolute -right-14 top-0 grid h-11 w-11 place-items-center rounded-full bg-white text-[#191919] shadow-sm transition hover:bg-[#F7F7FA]"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function EditableTableGrid({
  maxColumns,
  maxRows,
  onUpdate,
  rows,
  tablePath,
}: {
  maxColumns: number;
  maxRows: number;
  onUpdate: (rows: string[][]) => void;
  rows: string[][];
  tablePath: string;
}) {
  const tableRootRef = useRef<HTMLDivElement | null>(null);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const [columnMenu, setColumnMenu] = useState<{
    index: number;
    left: number;
  } | null>(null);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const selectedColumn =
    columnMenu == null
      ? null
      : Math.min(columnMenu.index, columnCount - 1);
  const columnWidth = 168;
  const actionColumnWidth = 48;
  const minimumTableWidth = columnCount * columnWidth + actionColumnWidth;
  const gridTemplateColumns = `repeat(${columnCount}, minmax(${columnWidth}px, 1fr)) ${actionColumnWidth}px`;
  const canAddRow = rows.length < maxRows;
  const canAddColumn = columnCount < maxColumns;
  const canDeleteRow = rows.length > 2;
  const canDeleteColumn = columnCount > 1;

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    onUpdate(
      rows.map((row, currentRow) =>
        currentRow === rowIndex
          ? row.map((cell, currentCol) =>
              currentCol === colIndex ? value : cell,
            )
          : row,
      ),
    );
  };

  const addRow = () => {
    if (!canAddRow) return;
    onUpdate([...rows, Array.from({ length: columnCount }, () => "")]);
  };

  const deleteRow = (rowIndex: number) => {
    if (!canDeleteRow || rowIndex === 0) return;
    onUpdate(rows.filter((_, index) => index !== rowIndex));
    setSelectedRowIndex((current) =>
      Math.max(0, Math.min(current, rows.length - 2)),
    );
  };

  const addColumn = () => {
    if (!canAddColumn) return;
    const insertIndex =
      selectedColumn == null
        ? columnCount
        : Math.min(columnCount, selectedColumn + 1);
    onUpdate(
      rows.map((row, rowIndex) => {
        const next = [...row];
        next.splice(
          insertIndex,
          0,
          rowIndex === 0 ? `Column ${columnCount + 1}` : "",
        );
        return next;
      }),
    );
  };

  const deleteColumn = (colIndex: number) => {
    if (!canDeleteColumn) return;
    onUpdate(rows.map((row) => row.filter((_, index) => index !== colIndex)));
    setColumnMenu(null);
    setColumnMenuOpen(false);
  };

  const moveColumn = (colIndex: number, direction: -1 | 1) => {
    const target = colIndex + direction;
    if (target < 0 || target >= columnCount) return;
    onUpdate(
      rows.map((row) => {
        const next = [...row];
        [next[colIndex], next[target]] = [next[target], next[colIndex]];
        return next;
      }),
    );
    setColumnMenu(null);
    setColumnMenuOpen(false);
  };

  const showColumnMenu = (colIndex: number, node: HTMLElement) => {
    const root = tableRootRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const columnRect = node.getBoundingClientRect();
    if (columnMenu?.index !== colIndex) setColumnMenuOpen(false);
    setColumnMenu({
      index: colIndex,
      left: Math.max(
        116,
        Math.min(
          columnRect.left + columnRect.width / 2 - rootRect.left,
          rootRect.width - 116,
        ),
      ),
    });
  };

  return (
    <div
      ref={tableRootRef}
      className="relative w-full px-4 pb-4 pt-10"
      onMouseLeave={() => {
        setColumnMenu(null);
        setColumnMenuOpen(false);
      }}
    >
      {selectedColumn != null && columnMenu ? (
        <div
          className="absolute top-0 z-20 flex h-8 w-[168px] -translate-x-1/2 items-center overflow-hidden rounded-xl border border-[#E6E6EA] bg-white pl-3 pr-1 text-[#191919] shadow-[0_3px_12px_rgba(16,24,40,0.10)]"
          style={{ left: columnMenu.left }}
        >
          <input
            className="h-full min-w-0 flex-1 truncate bg-transparent text-[12px] font-medium outline-none"
            spellCheck={false}
            value={rows[0]?.[selectedColumn] ?? ""}
            onChange={(event) =>
              updateCell(0, selectedColumn, event.target.value)
            }
          />
          <button
            type="button"
            aria-label="Delete selected column"
            className="grid h-7 w-7 shrink-0 place-items-center border-l border-[#ECECF1] text-[#191919] disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!canDeleteColumn}
            onClick={() => deleteColumn(selectedColumn)}
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-expanded={columnMenuOpen}
            aria-label="More column actions"
            className="grid h-7 w-5 shrink-0 place-items-center text-[#191919]"
            onClick={() => setColumnMenuOpen((current) => !current)}
          >
            <MoreVertical size={13} strokeWidth={2.3} />
          </button>
        </div>
      ) : null}

      {columnMenuOpen && selectedColumn != null && columnMenu ? (
        <div
          className="absolute top-9 z-30 w-[232px] -translate-x-1/2 overflow-hidden rounded-2xl border border-[#E6E6EA] bg-white py-2 shadow-[0_14px_36px_rgba(16,24,40,0.18)]"
          style={{ left: columnMenu.left }}
        >
          <ColumnMenuItem
            disabled={!canDeleteRow || selectedRowIndex === 0}
            icon={<Trash2 size={16} />}
            label="Delete Row"
            onClick={() => {
              deleteRow(selectedRowIndex);
              setColumnMenuOpen(false);
            }}
          />
          <ColumnMenuItem
            disabled={!canDeleteColumn}
            icon={<Trash2 size={16} />}
            label="Delete Column"
            onClick={() => deleteColumn(selectedColumn)}
          />
          <ColumnMenuItem
            disabled={!canAddRow}
            icon={<Plus size={16} />}
            label="Add Row"
            onClick={() => {
              addRow();
              setColumnMenuOpen(false);
            }}
          />
          <ColumnMenuItem
            disabled={!canAddColumn}
            icon={<Plus size={16} />}
            label="Add Column"
            onClick={() => {
              addColumn();
              setColumnMenuOpen(false);
            }}
          />
          <div className="my-2 h-px bg-[#ECECF1]" />
          <ColumnMenuItem
            disabled={selectedColumn >= columnCount - 1}
            icon={<ChevronRight size={16} />}
            label="Move Column Right"
            onClick={() => moveColumn(selectedColumn, 1)}
          />
          <ColumnMenuItem
            disabled={selectedColumn <= 0}
            icon={<ChevronLeft size={16} />}
            label="Move Column Left"
            onClick={() => moveColumn(selectedColumn, -1)}
          />
        </div>
      ) : null}

      <div className="relative rounded-b-lg bg-[#F3F4F6] pb-9 pr-9">
        <div className="relative z-10 max-h-[390px] overflow-auto">
          <div
            className="min-w-full text-[12px] text-[#191919]"
            style={{ minWidth: minimumTableWidth, width: "100%" }}
          >
            {rows.map((row, rowIndex) => (
              <div
                key={`${tablePath}-row-${rowIndex}`}
                className="grid"
                style={{ gridTemplateColumns }}
                onMouseEnter={() => setSelectedRowIndex(rowIndex)}
              >
                {Array.from({ length: columnCount }, (_, colIndex) => (
                  <div
                    key={`${tablePath}-cell-${rowIndex}-${colIndex}`}
                    className={`border-b border-r border-[#E8E8EC] px-3 py-1.5 ${
                      rowIndex === 0
                        ? "sticky top-0 z-20 bg-[#F6F7F8]"
                        : "bg-white"
                    }`}
                    onMouseEnter={
                      rowIndex === 0
                        ? (event) =>
                            showColumnMenu(colIndex, event.currentTarget)
                        : undefined
                    }
                  >
                    {rowIndex === 0 && colIndex === 0 ? (
                      <span className="absolute -left-6 top-1/2 flex -translate-y-1/2 items-center justify-center text-[#B0B4BE]">
                        <GripVertical size={13} strokeWidth={2.1} />
                      </span>
                    ) : null}
                    <input
                      className="h-7 w-full bg-transparent text-[12px] outline-none"
                      spellCheck={false}
                      value={row[colIndex] ?? ""}
                      onChange={(event) =>
                        updateCell(rowIndex, colIndex, event.target.value)
                      }
                      onFocus={
                        rowIndex === 0
                          ? (event) =>
                              showColumnMenu(colIndex, event.currentTarget)
                          : undefined
                      }
                    />
                  </div>
                ))}
                <div
                  className={`border-b border-[#E8E8EC] ${
                    rowIndex === 0 ? "sticky top-0 z-20 bg-[#F3F4F6]" : "bg-[#F3F4F6]"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label="Add row"
          disabled={!canAddRow}
          className="absolute bottom-2 left-1/2 flex h-7 -translate-x-1/2 items-center gap-1 rounded-full bg-white px-3 text-[11px] font-semibold text-[#191919] shadow-sm disabled:opacity-40"
          onClick={addRow}
        >
          <Plus size={13} />
          Add row
        </button>
        <button
          type="button"
          aria-label="Add column"
          disabled={!canAddColumn}
          className="absolute right-2 top-1/2 flex h-7 -translate-y-1/2 items-center gap-1 rounded-full bg-white px-3 text-[11px] font-semibold text-[#191919] shadow-sm disabled:opacity-40"
          onClick={addColumn}
        >
          <Plus size={13} />
          Add
        </button>
      </div>
    </div>
  );
}

function TablePreview({ rows }: { rows: string[][] }) {
  const preview = rows.slice(0, 5).map((row) => row.slice(0, 3));
  return (
    <div className="overflow-hidden rounded-md border border-[#E8E8EC] bg-white text-[10px] text-[#191919]">
      <table className="w-full border-collapse">
        <tbody>
          {preview.map((row, rowIndex) => (
            <tr key={`preview-${rowIndex}`}>
              {row.map((cell, colIndex) => (
                <td
                  key={`preview-${rowIndex}-${colIndex}`}
                  className={`max-w-[72px] truncate border border-[#EEEFF3] px-1.5 py-1 ${
                    rowIndex === 0 ? "bg-[#F6F7F8] font-semibold" : ""
                  }`}
                >
                  {cell || " "}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColumnMenuItem({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex h-10 w-full items-center gap-3 px-4 text-left text-[13px] font-medium text-[#191919] disabled:cursor-not-allowed disabled:opacity-38"
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
    >
      <span className="grid h-5 w-5 place-items-center text-[#111827]">
        {icon}
      </span>
      {label}
    </button>
  );
}

function normalizeGrid(rows: string[][]): string[][] {
  const columnCount = Math.max(1, ...rows.map((row) => row.length), 1);
  const next =
    rows.length > 0
      ? rows
      : [Array.from({ length: columnCount }, () => "")];
  return next.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );
}

function clearedGrid(rows: string[][]): string[][] {
  const grid = normalizeGrid(rows);
  return grid.map((row, rowIndex) =>
    rowIndex === 0 ? row : row.map(() => ""),
  );
}
