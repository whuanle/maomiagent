import type { LanguageCode } from "../../../config/titlebar"
import type { FeishuTranslate as Translate } from "../types"

const FEISHU_DOCS_CALLOUT_EMOJI_MAP: Record<string, string> = {
  grinning: "😀",
  grin: "😁",
  joy: "😂",
  smiley: "😃",
  smile: "😄",
  sweat_smile: "😅",
  laughing: "😆",
  wink: "😉",
  blush: "😊",
  yum: "😋",
  sunglasses: "😎",
  heart_eyes: "😍",
  kissing_heart: "😘",
  slightly_smiling_face: "🙂",
  hugging_face: "🤗",
  thinking_face: "🤔",
  neutral_face: "😐",
  open_mouth: "😮",
  sleepy: "😪",
  tired_face: "😫",
  relieved: "😌",
  confused: "😕",
  cry: "😢",
  sob: "😭",
  scream: "😱",
  rage: "😡",
  mask: "😷",
  nerd_face: "🤓",
  ghost: "👻",
  alien: "👽",
  robot_face: "🤖",
  clap: "👏",
  raised_hands: "🙌",
  pray: "🙏",
  muscle: "💪",
  point_right: "👉",
  point_down: "👇",
  wave: "👋",
  eyes: "👀",
  tongue: "👅",
  lips: "👄",
  heart: "❤️",
  blue_heart: "💙",
  green_heart: "💚",
  yellow_heart: "💛",
  purple_heart: "💜",
  orange_heart: "🧡",
  black_heart: "🖤",
  broken_heart: "💔",
  speech_balloon: "💬",
  thought_balloon: "💭",
  balloon: "🎈",
  tada: "🎉",
  confetti_ball: "🎊",
  gift: "🎁",
  trophy: "🏆",
  dart: "🎯",
  fire: "🔥",
  sparkles: "✨",
  star: "⭐",
  star2: "🌟",
  rainbow: "🌈",
  closed_umbrella: "🌂",
  umbrella_with_rain_drops: "☔",
  umbrella_on_ground: "⛱️",
  beach_with_umbrella: "🏖",
  camping: "🏕",
  house: "🏠",
  house_with_garden: "🏡",
  office: "🏢",
  school: "🏫",
  hospital: "🏥",
  bank: "🏦",
  hotel: "🏨",
  computer: "💻",
  camera: "📷",
  microphone: "🎤",
  books: "📚",
  book: "📖",
  green_book: "📗",
  blue_book: "📘",
  orange_book: "📙",
  notebook: "📓",
  notebook_with_decorative_cover: "📔",
  ledger: "📒",
  memo: "📝",
  page_facing_up: "📄",
  newspaper: "📰",
  bookmark_tabs: "📑",
  bookmark: "🔖",
  briefcase: "💼",
  file_folder: "📁",
  open_file_folder: "📂",
  date: "📅",
  calendar: "📆",
  card_index: "📇",
  bar_chart: "📊",
  chart_with_upwards_trend: "📈",
  chart_with_downwards_trend: "📉",
  clipboard: "📋",
  pushpin: "📌",
  round_pushpin: "📍",
  paperclip: "📎",
  link: "🔗",
  lock: "🔒",
  unlock: "🔓",
  key: "🔑",
  wrench: "🔧",
  hammer: "🔨",
  bulb: "💡",
  rocket: "🚀",
  white_check_mark: "✅",
  x: "❌",
  o: "⭕",
  question: "❓",
  grey_question: "❔",
  exclamation: "❗",
  grey_exclamation: "❕",
}

const FEISHU_DOCS_CALLOUT_BACKGROUND_COLORS: Record<string, string> = {
  "1": "#ffe9e9",
  "2": "#fff1e7",
  "3": "#fff8d9",
  "4": "#ebf9eb",
  "5": "#eaf3ff",
  "6": "#f2ebff",
  "7": "#f4f5f7",
  "8": "#ffd7d7",
  "9": "#ffd8b3",
  "10": "#ffec99",
  "11": "#d9f7be",
  "12": "#cfe2ff",
  "13": "#dfccff",
  "14": "#e5e7eb",
  "15": "#f7f7f8",
  "light-red": "#ffe9e9",
  "light-orange": "#fff1e7",
  "light-yellow": "#fff8d9",
  "light-green": "#ebf9eb",
  "light-blue": "#eaf3ff",
  "light-purple": "#f2ebff",
  "middle-gray": "#f4f5f7",
  gray: "#e5e7eb",
  "light-gray": "#f7f7f8",
  red: "#ffd7d7",
  orange: "#ffd8b3",
  yellow: "#ffec99",
  green: "#d9f7be",
  blue: "#cfe2ff",
  purple: "#dfccff",
  "light-red-background": "#ffe9e9",
  "light-orange-background": "#fff1e7",
  "light-yellow-background": "#fff8d9",
  "light-green-background": "#ebf9eb",
  "light-blue-background": "#eaf3ff",
  "light-purple-background": "#f2ebff",
  "pale-gray-background": "#f4f5f7",
  "dark-gray-background": "#e5e7eb",
  "dark-red-background": "#ffd7d7",
  "dark-orange-background": "#ffd8b3",
  "dark-yellow-background": "#ffec99",
  "dark-green-background": "#d9f7be",
  "dark-blue-background": "#cfe2ff",
  "dark-purple-background": "#dfccff",
}

const FEISHU_DOCS_CALLOUT_BORDER_COLORS: Record<string, string> = {
  "1": "#ffb3b3",
  "2": "#ffbe85",
  "3": "#ffd666",
  "4": "#8fd19e",
  "5": "#8cb8ff",
  "6": "#b99aff",
  "7": "#c9ccd4",
  red: "#ffb3b3",
  orange: "#ffbe85",
  yellow: "#ffd666",
  green: "#8fd19e",
  blue: "#8cb8ff",
  purple: "#b99aff",
  gray: "#c9ccd4",
}

const FEISHU_DOCS_FONT_COLORS: Record<string, string> = {
  "1": "#cf1322",
  "2": "#d46b08",
  "3": "#ad8b00",
  "4": "#389e0d",
  "5": "#0958d9",
  "6": "#722ed1",
  "7": "#595959",
  red: "#cf1322",
  orange: "#d46b08",
  yellow: "#ad8b00",
  green: "#389e0d",
  blue: "#0958d9",
  purple: "#722ed1",
  gray: "#595959",
}

function normalizeKeyword(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_.\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
}

function humanizeKeyword(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function decodeUrlLikeValue(value: string): string {
  let output = value.trim()
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(output)
      if (decoded === output) {
        break
      }
      output = decoded
    } catch {
      break
    }
  }
  return output
}

function parseBooleanLike(value: string): boolean | null {
  const normalized = normalizeKeyword(value)
  if (!normalized) {
    return null
  }
  if (normalized === "true" || normalized === "yes" || normalized === "1") {
    return true
  }
  if (normalized === "false" || normalized === "no" || normalized === "0") {
    return false
  }
  return null
}

export function canonicalizeFeishuDocsAttributeName(name: string): string {
  return normalizeKeyword(name)
}

export function normalizeFeishuDocsAttributes(attributes: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {}
  for (const [name, rawValue] of Object.entries(attributes)) {
    const normalizedName = canonicalizeFeishuDocsAttributeName(name)
    if (!normalizedName) {
      continue
    }
    const value = rawValue.trim()
    if (!value) {
      continue
    }
    output[normalizedName] = value
  }
  return output
}

export function readPreferredFeishuDocsAttribute(attributes: Record<string, string>, names: string[]): string {
  const normalizedAttributes = normalizeFeishuDocsAttributes(attributes)
  for (const name of names) {
    const value = normalizedAttributes[canonicalizeFeishuDocsAttributeName(name)]?.trim()
    if (value) {
      return value
    }
  }
  return ""
}

export function normalizeFeishuDocsPreviewHref(rawValue: string): string | null {
  const trimmed = rawValue.trim()
  if (/^data:/i.test(trimmed)) {
    return trimmed
  }
  if (/^desktop:\/\/feishu\//i.test(trimmed)) {
    return trimmed
  }
  const decoded = /^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")
    ? trimmed
    : decodeUrlLikeValue(trimmed)
  if (!decoded) {
    return null
  }
  const value = decoded.startsWith("//") ? `https:${decoded}` : decoded
  try {
    const url = new URL(value)
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:") {
      return url.toString()
    }
    return null
  } catch {
    return null
  }
}

export function resolveFeishuDocsUrlHostLabel(rawValue: string): string {
  try {
    return new URL(rawValue).hostname
  } catch {
    return rawValue
  }
}

export function resolveFeishuDocsCalloutStyle(attributes: Record<string, string>) {
  const backgroundColorRaw = readPreferredFeishuDocsAttribute(attributes, ["background-color", "background"])
  const borderColorRaw = readPreferredFeishuDocsAttribute(attributes, ["border-color", "border"])
  const textColorRaw = readPreferredFeishuDocsAttribute(attributes, ["text-color", "color"])
  const backgroundColor =
    FEISHU_DOCS_CALLOUT_BACKGROUND_COLORS[normalizeKeyword(backgroundColorRaw)]
    || backgroundColorRaw
    || "#f7f8fb"
  const borderColor =
    FEISHU_DOCS_CALLOUT_BORDER_COLORS[normalizeKeyword(borderColorRaw)]
    || borderColorRaw
    || "#d7dbe7"
  const textColor =
    FEISHU_DOCS_FONT_COLORS[normalizeKeyword(textColorRaw)]
    || textColorRaw
    || undefined

  return {
    backgroundColor,
    borderColor,
    textColor,
  }
}

export function resolveFeishuDocsCalloutEmoji(rawValue: string): {
  symbol: string
  label?: string
  matched: boolean
} {
  const value = rawValue.trim()
  if (!value) {
    return {
      symbol: "💡",
      matched: false,
    }
  }
  if (/\p{Extended_Pictographic}/u.test(value)) {
    return {
      symbol: value,
      matched: true,
    }
  }
  const normalizedId = normalizeKeyword(value).replace(/-/g, "_")
  const symbol = FEISHU_DOCS_CALLOUT_EMOJI_MAP[normalizedId]
  if (symbol) {
    return {
      symbol,
      matched: true,
    }
  }
  return {
    symbol: "💡",
    label: humanizeKeyword(normalizedId),
    matched: false,
  }
}

function formatReminderTimestamp(
  value: string,
  wholeDay: boolean,
  language: LanguageCode = "zh-CN",
): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return ""
  }
  const formatter = new Intl.DateTimeFormat(language === "en-US" ? "en-US" : "zh-CN", wholeDay
    ? {
      month: "2-digit",
      day: "2-digit",
    }
    : {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  return formatter.format(new Date(numeric))
}

export function formatFeishuDocsReminderMeta(
  attributes: Record<string, string>,
  language: LanguageCode = "zh-CN",
  t?: Translate,
): string {
  const explicit = readPreferredFeishuDocsAttribute(attributes, ["time", "date", "datetime", "status"])
  if (explicit) {
    return explicit
  }
  const isWholeDay = parseBooleanLike(readPreferredFeishuDocsAttribute(attributes, ["is-whole-day"])) ?? false
  const expireTime = formatReminderTimestamp(
    readPreferredFeishuDocsAttribute(attributes, ["expire-time"]),
    isWholeDay,
    language,
  )
  if (expireTime) {
    return isWholeDay
      ? `${expireTime} ${t ? t("飞书页.文档.预览.提醒.全天") : (language === "en-US" ? "All day" : "全天")}`
      : expireTime
  }
  return formatReminderTimestamp(
    readPreferredFeishuDocsAttribute(attributes, ["notify-time"]),
    isWholeDay,
    language,
  )
}

export function resolveFeishuDocsViewTypeLabel(rawValue: string, t?: Translate): string {
  switch (rawValue.trim()) {
    case "1":
      return t ? t("飞书页.文档.预览.视图类型.卡片") : "卡片视图"
    case "2":
      return t ? t("飞书页.文档.预览.视图类型.预览") : "预览视图"
    case "3":
      return t ? t("飞书页.文档.预览.视图类型.内联") : "内联视图"
    default:
      return rawValue.trim()
  }
}

export function resolveFeishuDocsGridTemplateColumns(columnRatios: string[]): string | null {
  const ratios = columnRatios
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (ratios.length !== columnRatios.length || ratios.length === 0) {
    return null
  }
  return ratios.map((value) => `minmax(0, ${value}fr)`).join(" ")
}
