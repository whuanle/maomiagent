export type ConversationChartPreviewParser =
  | "echarts"
  | "chartjs"
  | "generic";

export type ConversationAxisChartSeriesType = "bar" | "line";

export type ConversationAxisChartPreviewSeries = {
  name: string;
  color: string;
  values: number[];
  chartType: ConversationAxisChartSeriesType;
};

export type ConversationAxisChartPreviewModel = {
  kind: "axis";
  parser: ConversationChartPreviewParser;
  title?: string;
  categories: string[];
  series: ConversationAxisChartPreviewSeries[];
};

export type ConversationPieChartPreviewModel = {
  kind: "pie";
  parser: ConversationChartPreviewParser;
  title?: string;
  style: "pie" | "doughnut";
  slices: Array<{
    name: string;
    color: string;
    value: number;
  }>;
};

export type ConversationChartPreviewModel =
  | ConversationAxisChartPreviewModel
  | ConversationPieChartPreviewModel;

export type ConversationChartPreviewParseResult = {
  format: "json" | "text";
  model: ConversationChartPreviewModel | null;
  parsed: unknown | null;
  error?: string;
};

const CHART_COLOR_PALETTE = [
  "#3158b7",
  "#f97316",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#f59e0b",
  "#84cc16",
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readColor(index: number) {
  return CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length];
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function readDelimitedList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.startsWith("[") && trimmed.endsWith("]")
    ? trimmed.slice(1, -1)
    : trimmed;

  return normalized
    .split(",")
    .map((item) => stripWrappingQuotes(item))
    .filter(Boolean);
}

function readDelimitedNumberList(value: string): number[] {
  return readDelimitedList(value)
    .map((item) => readNumber(item))
    .filter((item): item is number => item !== undefined);
}

function splitKeyValue(line: string): { key: string; value: string } | null {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = line.slice(0, separatorIndex).trim();
  if (!key) {
    return null;
  }

  return {
    key,
    value: line.slice(separatorIndex + 1).trim(),
  };
}

function parseTextChartPreviewSource(source: string): {
  model: ConversationChartPreviewModel | null;
  parsed: Record<string, unknown> | null;
  error?: string;
} {
  const lines = source
    .split(/\r?\n/u)
    .map((line) => line.replace(/\t/g, "  "));

  const topLevel: Record<string, string> = {};
  const seriesItems: Array<Record<string, string>> = [];
  const sliceItems: Array<Record<string, string>> = [];
  let section: "series" | "slices" | null = null;
  let currentItem: Record<string, string> | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    if (indent === 0) {
      currentItem = null;

      if (trimmed === "series:") {
        section = "series";
        continue;
      }

      if (trimmed === "slices:") {
        section = "slices";
        continue;
      }

      section = null;
      const keyValue = splitKeyValue(trimmed);
      if (keyValue) {
        topLevel[keyValue.key] = keyValue.value;
      }
      continue;
    }

    if (!section) {
      continue;
    }

    if (trimmed.startsWith("- ")) {
      currentItem = {};
      if (section === "series") {
        seriesItems.push(currentItem);
      } else {
        sliceItems.push(currentItem);
      }

      const inlineKeyValue = splitKeyValue(trimmed.slice(2).trim());
      if (inlineKeyValue) {
        currentItem[inlineKeyValue.key] = inlineKeyValue.value;
      }
      continue;
    }

    if (!currentItem) {
      continue;
    }

    const keyValue = splitKeyValue(trimmed);
    if (keyValue) {
      currentItem[keyValue.key] = keyValue.value;
    }
  }

  const parsed: Record<string, unknown> = {
    ...(topLevel.title ? { title: stripWrappingQuotes(topLevel.title) } : {}),
  };

  if (topLevel.categories) {
    parsed.categories = readDelimitedList(topLevel.categories);
  }

  if (topLevel.style) {
    parsed.style = stripWrappingQuotes(topLevel.style);
  }

  if (seriesItems.length > 0) {
    parsed.series = seriesItems.map((item) => ({
      ...(item.name ? { name: stripWrappingQuotes(item.name) } : {}),
      ...(item.type ? { type: stripWrappingQuotes(item.type) } : {}),
      ...(item.color ? { color: stripWrappingQuotes(item.color) } : {}),
      values: item.values ? readDelimitedNumberList(item.values) : [],
    }));
  }

  if (sliceItems.length > 0) {
    parsed.slices = sliceItems.map((item, index) => ({
      name: stripWrappingQuotes(item.name || `Slice ${index + 1}`),
      value: readNumber(item.value) ?? 0,
      ...(item.color ? { color: stripWrappingQuotes(item.color) } : {}),
    }));
  }

  const categories = asArray(parsed.categories).map((item, index) => readString(item) ?? String(index + 1));
  const series = asArray(parsed.series);
  if (categories.length > 0 && series.length > 0) {
    return {
      parsed,
      model: {
        kind: "axis",
        parser: "generic",
        title: readString(parsed.title),
        categories,
        series: series.map((item, index) => {
          const record = asRecord(item);
          return {
            name: readString(record.name) ?? `Series ${index + 1}`,
            color: readString(record.color) ?? readColor(index),
            values: categories.map((_, categoryIndex) => readNumber(asArray(record.values)[categoryIndex]) ?? 0),
            chartType: readString(record.type)?.toLowerCase() === "line" ? "line" as const : "bar" as const,
          };
        }),
      },
    };
  }

  const slices = asArray(parsed.slices)
    .map((item, index) => {
      const record = asRecord(item);
      const value = readNumber(record.value) ?? 0;
      if (value <= 0) {
        return null;
      }

      return {
        name: readString(record.name) ?? `Slice ${index + 1}`,
        value,
        color: readString(record.color) ?? readColor(index),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (slices.length > 0) {
    return {
      parsed,
      model: {
        kind: "pie",
        parser: "generic",
        title: readString(parsed.title),
        style: readString(parsed.style)?.toLowerCase() === "doughnut" ? "doughnut" : "pie",
        slices,
      },
    };
  }

  return {
    parsed,
    model: null,
    error: "Unsupported chart preview payload.",
  };
}

function parseEChartsModel(parsed: Record<string, unknown>): ConversationChartPreviewModel | null {
  const seriesItems = asArray(parsed.series);
  if (seriesItems.length === 0) {
    return null;
  }

  const primarySeries = asRecord(seriesItems[0]);
  const primaryType = readString(primarySeries.type)?.toLowerCase();
  const title = readString(asRecord(parsed.title).text) ?? readString(parsed.title);

  if (primaryType === "pie") {
    const data = asArray(primarySeries.data);
    const slices = data
      .map((item, index) => {
        const record = asRecord(item);
        const value = readNumber(record.value) ?? readNumber(item) ?? 0;
        const name = readString(record.name) ?? `Slice ${index + 1}`;
        return {
          name,
          value,
          color: readColor(index),
        };
      })
      .filter((item) => item.value > 0);

    if (slices.length === 0) {
      return null;
    }

    return {
      kind: "pie",
      parser: "echarts",
      title,
      style: Array.isArray(primarySeries.radius) ? "doughnut" : "pie",
      slices,
    };
  }

  const categories = asArray(asRecord(parsed.xAxis).data).map((item, index) => readString(item) ?? String(index + 1));
  const normalizedSeries = seriesItems
    .map((item, index) => {
      const record = asRecord(item);
      const data = asArray(record.data);
      return {
        name: readString(record.name) ?? `Series ${index + 1}`,
        color: readColor(index),
        values: categories.map((_, categoryIndex) => readNumber(data[categoryIndex]) ?? 0),
        chartType: readString(record.type)?.toLowerCase() === "line" ? "line" as const : "bar" as const,
      };
    })
    .filter((item) => item.values.length > 0);

  if (categories.length === 0 || normalizedSeries.length === 0) {
    return null;
  }

  return {
    kind: "axis",
    parser: "echarts",
    title,
    categories,
    series: normalizedSeries,
  };
}

function parseChartJsModel(parsed: Record<string, unknown>): ConversationChartPreviewModel | null {
  const data = asRecord(parsed.data);
  const categories = asArray(data.labels).map((item, index) => readString(item) ?? String(index + 1));
  const datasets = asArray(data.datasets);
  if (categories.length === 0 || datasets.length === 0) {
    return null;
  }

  const title = readString(asRecord(asRecord(asRecord(parsed.options).plugins).title).text) ?? readString(parsed.title);
  const primaryType = readString(parsed.type)?.toLowerCase();
  if (primaryType === "pie" || primaryType === "doughnut") {
    const firstDataset = asRecord(datasets[0]);
    const values = asArray(firstDataset.data);
    const backgroundColors = asArray(firstDataset.backgroundColor);
    const slices = categories
      .map((name, index) => ({
        name,
        value: readNumber(values[index]) ?? 0,
        color: readString(backgroundColors[index]) ?? readColor(index),
      }))
      .filter((item) => item.value > 0);

    if (slices.length === 0) {
      return null;
    }

    return {
      kind: "pie",
      parser: "chartjs",
      title,
      style: primaryType === "doughnut" ? "doughnut" : "pie",
      slices,
    };
  }

  return {
    kind: "axis",
    parser: "chartjs",
    title,
    categories,
    series: datasets.map((item, index) => {
      const record = asRecord(item);
      const values = asArray(record.data);
      return {
        name: readString(record.label) ?? `Series ${index + 1}`,
        color: readString(record.borderColor) ?? readString(record.backgroundColor) ?? readColor(index),
        values: categories.map((_, categoryIndex) => readNumber(values[categoryIndex]) ?? 0),
        chartType: readString(record.type)?.toLowerCase() === "line" || primaryType === "line" ? "line" as const : "bar" as const,
      };
    }),
  };
}

function parseGenericModel(parsed: Record<string, unknown>): ConversationChartPreviewModel | null {
  const categories = asArray(parsed.categories).map((item, index) => readString(item) ?? String(index + 1));
  const seriesItems = asArray(parsed.series);
  if (categories.length === 0 || seriesItems.length === 0) {
    return null;
  }

  return {
    kind: "axis",
    parser: "generic",
    title: readString(parsed.title),
    categories,
    series: seriesItems.map((item, index) => {
      const record = asRecord(item);
      return {
        name: readString(record.name) ?? `Series ${index + 1}`,
        color: readString(record.color) ?? readColor(index),
        values: categories.map((_, categoryIndex) => readNumber(asArray(record.values)[categoryIndex]) ?? 0),
        chartType: readString(record.type)?.toLowerCase() === "line" ? "line" as const : "bar" as const,
      };
    }),
  };
}

export function parseConversationChartPreviewSource(
  source: string,
): ConversationChartPreviewParseResult {
  const normalized = source.trim();
  if (!normalized) {
    return {
      format: "text",
      parsed: null,
      model: null,
      error: "Empty chart preview source.",
    };
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    const record = asRecord(parsed);

    const model = parseEChartsModel(record)
      ?? parseChartJsModel(record)
      ?? parseGenericModel(record);

    if (!model) {
      return {
        format: "json",
        parsed,
        model: null,
        error: "Unsupported chart preview payload.",
      };
    }

    return {
      format: "json",
      parsed,
      model,
    };
  } catch (error) {
    const textResult = parseTextChartPreviewSource(normalized);
    if (textResult.model) {
      return {
        format: "text",
        parsed: textResult.parsed,
        model: textResult.model,
      };
    }

    return {
      format: "text",
      parsed: textResult.parsed,
      model: null,
      error: textResult.error ?? (error instanceof Error ? error.message : String(error)),
    };
  }
}