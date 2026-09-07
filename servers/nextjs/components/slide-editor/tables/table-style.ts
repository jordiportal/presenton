export const SIMPLE_TABLE_MAX_COLUMNS = 6;
export const SIMPLE_TABLE_MAX_ROWS = 8;
export const ADVANCED_TABLE_MAX_COLUMNS = 16;
export const ADVANCED_TABLE_MAX_ROWS = 24;

export type TableStyleLike = {
  max_columns?: number | null;
  max_rows?: number | null;
  name?: string | null;
  table_style?: string | null;
};

export function isAdvancedTable(element: TableStyleLike | null | undefined) {
  return (
    element?.table_style === "advanced" || element?.name === "advanced_table"
  );
}

export function tableColumnLimit(element: TableStyleLike) {
  if (typeof element.max_columns === "number" && element.max_columns > 0) {
    return element.max_columns;
  }
  return isAdvancedTable(element)
    ? ADVANCED_TABLE_MAX_COLUMNS
    : SIMPLE_TABLE_MAX_COLUMNS;
}

export function tableRowLimit(element: TableStyleLike) {
  if (typeof element.max_rows === "number" && element.max_rows > 0) {
    return element.max_rows;
  }
  return isAdvancedTable(element)
    ? ADVANCED_TABLE_MAX_ROWS
    : SIMPLE_TABLE_MAX_ROWS;
}
