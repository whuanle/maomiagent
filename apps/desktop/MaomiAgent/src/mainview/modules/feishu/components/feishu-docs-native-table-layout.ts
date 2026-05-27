import type { FeishuDocsPreviewNode } from "./feishu-docs-local-preview-model"
import {
  normalizeFeishuDocsAttributes,
  readPreferredFeishuDocsAttribute,
} from "./feishu-docs-render-utils"

type NativePreviewNode = Extract<FeishuDocsPreviewNode, { kind: "native_block" }>

export type NativeTableCellPlacement = {
  key: string
  node: NativePreviewNode
  header: boolean
  rowSpan: number
  colSpan: number
  columnIndex: number
}

export type NativeTableRow = {
  key: string
  header: boolean
  cells: NativeTableCellPlacement[]
}

export const TABLE_COLUMN_COUNT_ATTRIBUTE_NAMES = [
  "column-size",
  "column_size",
  "column-count",
  "column_count",
  "columns",
  "cols",
  "property-column-size",
  "property_column_size",
  "property-column-count",
  "property_column_count",
] as const

export const TABLE_ROW_COUNT_ATTRIBUTE_NAMES = [
  "row-size",
  "row_size",
  "row-count",
  "row_count",
  "rows",
  "property-row-size",
  "property_row_size",
  "property-row-count",
  "property_row_count",
] as const

const TABLE_HEADER_ROW_COUNT_ATTRIBUTE_NAMES = [
  "header-row-size",
  "header_row_size",
  "header-row-count",
  "header_row_count",
  "head-row-size",
  "head_row_size",
  "property-header-row-size",
  "property_header_row_size",
  "property-header-row-count",
  "property_header_row_count",
] as const

const TABLE_CELL_HEADER_ATTRIBUTE_NAMES = [
  "header",
  "is-header",
  "is_header",
  "head",
  "thead",
  "property-header",
  "property_header",
  "property-is-header",
  "property_is_header",
  "property-head",
  "property_head",
] as const

const TABLE_CELL_ROW_SPAN_ATTRIBUTE_NAMES = [
  "row-span",
  "row_span",
  "rowspan",
  "property-row-span",
  "property_row_span",
  "property-rowspan",
  "property_rowspan",
] as const

const TABLE_CELL_COLUMN_SPAN_ATTRIBUTE_NAMES = [
  "column-span",
  "column_span",
  "col-span",
  "col_span",
  "colspan",
  "property-column-span",
  "property_column_span",
  "property-col-span",
  "property_col_span",
  "property-colspan",
  "property_colspan",
] as const

const TABLE_CELL_ROW_INDEX_ATTRIBUTE_NAMES = [
  "row-index",
  "row_index",
  "row",
  "data-row",
  "table-row",
  "table_row",
  "property-row-index",
  "property_row_index",
  "property-data-row",
  "property_data_row",
  "property-table-row",
  "property_table_row",
] as const

const TABLE_CELL_COLUMN_INDEX_ATTRIBUTE_NAMES = [
  "column-index",
  "column_index",
  "column",
  "col",
  "data-column",
  "data-col",
  "table-column",
  "table_column",
  "property-column-index",
  "property_column_index",
  "property-data-column",
  "property_data_column",
  "property-data-col",
  "property_data_col",
  "property-table-column",
  "property_table_column",
] as const

function readPositiveIntegerAttribute(attributes: Record<string, string>, names: readonly string[]): number | null {
  const value = readPreferredFeishuDocsAttribute(attributes, [...names])?.trim() ?? ""
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function readBooleanAttribute(attributes: Record<string, string>, names: readonly string[]): boolean | null {
  const value = readPreferredFeishuDocsAttribute(attributes, [...names])?.trim().toLowerCase() ?? ""
  if (!value) {
    return null
  }

  if (["true", "1", "yes", "y", "header", "head", "th"].includes(value)) {
    return true
  }

  if (["false", "0", "no", "n"].includes(value)) {
    return false
  }

  return null
}

export function collectNativeTableRows(
  tableAttributes: Record<string, string>,
  nodes: FeishuDocsPreviewNode[],
): NativeTableRow[] {
  const cells = nodes.filter(
    (node): node is NativePreviewNode => node.kind === "native_block" && node.name === "table-cell",
  )

  if (cells.length === 0) {
    return []
  }

  const explicitColumnCount = readPositiveIntegerAttribute(
    tableAttributes,
    TABLE_COLUMN_COUNT_ATTRIBUTE_NAMES,
  )
  const explicitRowCount = readPositiveIntegerAttribute(
    tableAttributes,
    TABLE_ROW_COUNT_ATTRIBUTE_NAMES,
  )
  const explicitHeaderRowCount = readPositiveIntegerAttribute(
    tableAttributes,
    TABLE_HEADER_ROW_COUNT_ATTRIBUTE_NAMES,
  ) ?? 0

  const placements = cells.map((cell, index) => {
    const cellAttributes = normalizeFeishuDocsAttributes(cell.attributes)
    return {
      key: cell.key || `cell:${index}`,
      node: cell,
      header: readBooleanAttribute(cellAttributes, TABLE_CELL_HEADER_ATTRIBUTE_NAMES) === true,
      rowSpan: readPositiveIntegerAttribute(cellAttributes, TABLE_CELL_ROW_SPAN_ATTRIBUTE_NAMES) ?? 1,
      colSpan: readPositiveIntegerAttribute(cellAttributes, TABLE_CELL_COLUMN_SPAN_ATTRIBUTE_NAMES) ?? 1,
      rowIndex: readPositiveIntegerAttribute(cellAttributes, TABLE_CELL_ROW_INDEX_ATTRIBUTE_NAMES),
      columnIndex: readPositiveIntegerAttribute(cellAttributes, TABLE_CELL_COLUMN_INDEX_ATTRIBUTE_NAMES),
    }
  })

  const hasExplicitCoordinates = placements.some((cell) => cell.rowIndex !== null || cell.columnIndex !== null)
  if (hasExplicitCoordinates) {
    const rows = new Map<number, NativeTableRow>()

    for (const [index, cell] of placements.entries()) {
      const resolvedRowIndex = (cell.rowIndex ?? (explicitColumnCount ? Math.floor(index / explicitColumnCount) + 1 : 1)) - 1
      const resolvedColumnIndex = (cell.columnIndex ?? (explicitColumnCount ? (index % explicitColumnCount) + 1 : index + 1)) - 1
      const row = rows.get(resolvedRowIndex) ?? {
        key: `row:${resolvedRowIndex}`,
        header: resolvedRowIndex < explicitHeaderRowCount,
        cells: [],
      }

      row.header = row.header || cell.header
      row.cells.push({
        key: cell.key,
        node: cell.node,
        header: cell.header,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
        columnIndex: Math.max(resolvedColumnIndex, 0),
      })
      rows.set(resolvedRowIndex, row)
    }

    return [...rows.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, row]) => ({
        ...row,
        cells: [...row.cells].sort((left, right) => left.columnIndex - right.columnIndex),
      }))
  }

  let inferredColumnCount = explicitColumnCount
  if (!inferredColumnCount && explicitRowCount && cells.length % explicitRowCount === 0) {
    inferredColumnCount = Math.max(1, cells.length / explicitRowCount)
  }
  if (!inferredColumnCount) {
    inferredColumnCount = cells.length
  }

  const rows: NativeTableRow[] = []
  for (let index = 0; index < cells.length; index += inferredColumnCount) {
    const slice = cells.slice(index, index + inferredColumnCount)
    const rowIndex = rows.length
    rows.push({
      key: `row:${rowIndex}`,
      header: rowIndex < explicitHeaderRowCount || slice.some((cell) => {
        const cellAttributes = normalizeFeishuDocsAttributes(cell.attributes)
        return readBooleanAttribute(cellAttributes, TABLE_CELL_HEADER_ATTRIBUTE_NAMES) === true
      }),
      cells: slice.map((cell, cellIndex) => {
        const cellAttributes = normalizeFeishuDocsAttributes(cell.attributes)
        return {
          key: cell.key || `row:${rowIndex}:cell:${cellIndex}`,
          node: cell,
          header: readBooleanAttribute(cellAttributes, TABLE_CELL_HEADER_ATTRIBUTE_NAMES) === true,
          rowSpan: readPositiveIntegerAttribute(cellAttributes, TABLE_CELL_ROW_SPAN_ATTRIBUTE_NAMES) ?? 1,
          colSpan: readPositiveIntegerAttribute(cellAttributes, TABLE_CELL_COLUMN_SPAN_ATTRIBUTE_NAMES) ?? 1,
          columnIndex: cellIndex,
        }
      }),
    })
  }

  return rows
}
