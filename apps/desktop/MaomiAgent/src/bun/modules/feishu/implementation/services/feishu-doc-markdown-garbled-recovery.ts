const FEISHU_DOC_MOJIBAKE_SEQUENCE_PATTERN = /[ÃÂ][\u0080-\u00ff]|[æäåçèéêëïð][\u0080-\u00bf]/g;
const FEISHU_DOC_C1_CONTROL_PATTERN = /[\u0080-\u009f]/g;
const FEISHU_DOC_CJK_PATTERN = /[\u3400-\u9fff]/g;
const FEISHU_DOC_REPLACEMENT_CHARACTER_PATTERN = /\ufffd/g;

type FeishuDocMarkdownEncodingStats = {
  mojibakeSequenceCount: number;
  controlCount: number;
  cjkCount: number;
  replacementCount: number;
};

function countMatches(pattern: RegExp, value: string): number {
  return value.match(pattern)?.length ?? 0;
}

function collectEncodingStats(value: string): FeishuDocMarkdownEncodingStats {
  return {
    mojibakeSequenceCount: countMatches(FEISHU_DOC_MOJIBAKE_SEQUENCE_PATTERN, value),
    controlCount: countMatches(FEISHU_DOC_C1_CONTROL_PATTERN, value),
    cjkCount: countMatches(FEISHU_DOC_CJK_PATTERN, value),
    replacementCount: countMatches(FEISHU_DOC_REPLACEMENT_CHARACTER_PATTERN, value),
  };
}

function improvesEncodingQuality(
  original: FeishuDocMarkdownEncodingStats,
  recovered: FeishuDocMarkdownEncodingStats,
): boolean {
  if (recovered.controlCount > original.controlCount) {
    return false;
  }

  if (recovered.replacementCount > original.replacementCount) {
    return false;
  }

  if (recovered.mojibakeSequenceCount >= original.mojibakeSequenceCount) {
    return false;
  }

  return recovered.cjkCount > original.cjkCount;
}

export function shouldAttemptRecoverFeishuDocMarkdown(value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  const stats = collectEncodingStats(value);
  if (stats.controlCount > 0) {
    return true;
  }

  return stats.mojibakeSequenceCount >= 2 && stats.cjkCount === 0;
}

export function recoverFeishuDocMarkdownFromGarbledText(value: string): string | null {
  if (!shouldAttemptRecoverFeishuDocMarkdown(value)) {
    return null;
  }

  const recovered = Buffer.from(value, "latin1").toString("utf8");
  if (!recovered.trim() || recovered === value) {
    return null;
  }

  return improvesEncodingQuality(collectEncodingStats(value), collectEncodingStats(recovered))
    ? recovered
    : null;
}
