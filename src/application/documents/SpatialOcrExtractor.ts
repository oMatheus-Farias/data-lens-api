import type { IOcrWord } from './OcrPage';

interface ISpatialValue {
  text: string;
  confidence: number | null;
  labelText: string;
  labelBox: IOcrWord['box'];
  valueBox: IOcrWord['box'];
}

interface ISpatialExtractionOptions {
  regionStart: RegExp;
  regionEnd: RegExp;
  maxRegionHeight?: number;
  valuePattern?: RegExp;
  debug?: { pageNumber: number; section: string };
}

interface ILineWord extends IOcrWord {
  start: number;
  end: number;
}

interface IOcrLine {
  words: ILineWord[];
  text: string;
  top: number;
  bottom: number;
}

interface ILabelMatch {
  key: string;
  line: IOcrLine;
  start: number;
  end: number;
  left: number;
  right: number;
  center: number;
}

const NON_VALUE_LINE =
  /^(?:STATUS\s+LEGAL|AUTORIZADO|DANFE|DOCUMENTO\s+AUXILIAR|DESTINAT[AÁ]RIO|EMITENTE|FATURA|C[ÁA]LCULO\s+DO\s+IMPOSTO|INSCRI[CÇ][ÃA]O\s+ESTADUAL|UF)\b/i;

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function makeLines(words: IOcrWord[]): IOcrLine[] {
  const sorted = [...words]
    .filter((word) => word.text.trim() && word.box.width >= 0 && word.box.height > 0)
    .sort(
      (first, second) =>
        first.box.y + first.box.height / 2 - (second.box.y + second.box.height / 2) ||
        first.box.x - second.box.x,
    );
  const lines: IOcrWord[][] = [];

  for (const word of sorted) {
    const wordCenter = word.box.y + word.box.height / 2;
    const matchingLine = lines
      .map((line) => {
        const lineCenter = median(line.map((lineWord) => lineWord.box.y + lineWord.box.height / 2));
        const lineHeight = median(line.map((lineWord) => lineWord.box.height));
        const tolerance = Math.max(0.003, Math.min(lineHeight, word.box.height) * 0.7);
        return { line, distance: Math.abs(lineCenter - wordCenter), tolerance };
      })
      .filter((candidate) => candidate.distance <= candidate.tolerance)
      .sort((first, second) => first.distance - second.distance)[0]?.line;
    if (matchingLine) {
      matchingLine.push(word);
    } else {
      lines.push([word]);
    }
  }

  return lines
    .map((lineWords) => {
      const ordered = lineWords.sort((first, second) => first.box.x - second.box.x);
      let offset = 0;
      const positionedWords = ordered.map((word) => {
        const start = offset;
        offset += word.text.length;
        const end = offset;
        offset += 1;
        return { ...word, start, end };
      });

      return {
        words: positionedWords,
        text: positionedWords.map((word) => word.text).join(' '),
        top: Math.min(...positionedWords.map((word) => word.box.y)),
        bottom: Math.max(...positionedWords.map((word) => word.box.y + word.box.height)),
      };
    })
    .sort((first, second) => first.top - second.top);
}

function matchWords(line: IOcrLine, matchStart: number, matchEnd: number): ILineWord[] {
  return line.words.filter((word) => word.start < matchEnd && word.end > matchStart);
}

function recognizedLabels(lines: IOcrLine[], patterns: Record<string, RegExp>): ILabelMatch[] {
  const labels: ILabelMatch[] = [];

  for (const line of lines) {
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = pattern.exec(line.text);
      if (!match || match.index === undefined) {
        continue;
      }

      const labelWords = matchWords(line, match.index, match.index + match[0].length);
      if (labelWords.length === 0) {
        continue;
      }

      const left = Math.min(...labelWords.map((word) => word.box.x));
      const right = Math.max(...labelWords.map((word) => word.box.x + word.box.width));
      labels.push({
        key,
        line,
        start: match.index,
        end: match.index + match[0].length,
        left,
        right,
        center: (left + right) / 2,
      });
    }
  }

  return labels;
}

function cellBounds(label: ILabelMatch, peers: ILabelMatch[]): { left: number; right: number } {
  const labelY = (label.line.top + label.line.bottom) / 2;
  const rowLabels = peers
    .filter(
      (peer) =>
        peer !== label && Math.abs((peer.line.top + peer.line.bottom) / 2 - labelY) <= 0.012,
    )
    .sort((first, second) => first.center - second.center);
  const rightNeighbor = rowLabels.find((peer) => peer.center > label.center);

  return {
    left: label.left,
    right: rightNeighbor?.left ?? 1,
  };
}

function boxFor(words: IOcrWord[]): IOcrWord['box'] {
  const x = Math.min(...words.map((word) => word.box.x));
  const y = Math.min(...words.map((word) => word.box.y));
  const right = Math.max(...words.map((word) => word.box.x + word.box.width));
  const bottom = Math.max(...words.map((word) => word.box.y + word.box.height));
  return { x, y, width: right - x, height: bottom - y };
}

function lineValue(
  words: ILineWord[],
  label: ILabelMatch,
  valuePattern?: RegExp,
): ISpatialValue | null {
  const valueWords = words.filter(
    (word) => !NON_VALUE_LINE.test(word.text) && (!valuePattern || valuePattern.test(word.text)),
  );
  const text = valueWords
    .map((word) => word.text)
    .join(' ')
    .trim();

  if (!text || NON_VALUE_LINE.test(text)) {
    return null;
  }

  const confidences = valueWords
    .map((word) => word.confidence)
    .filter((confidence): confidence is number => confidence !== null);

  return {
    text,
    confidence:
      confidences.length > 0
        ? confidences.reduce((total, confidence) => total + confidence, 0) / confidences.length
        : null,
    labelText: label.line.text.slice(label.start, label.end),
    labelBox: boxFor(matchWords(label.line, label.start, label.end)),
    valueBox: boxFor(valueWords),
  };
}

function logSpatialColumns(
  debug: ISpatialExtractionOptions['debug'],
  values: Record<string, ISpatialValue>,
): void {
  if (!debug) {
    return;
  }

  process.stdout.write(
    `[cloud-vision-columns] ${JSON.stringify({
      pageNumber: debug.pageNumber,
      section: debug.section,
      fields: values,
    })}\n`,
  );
}

export function extractSpatialOcrValues(
  words: IOcrWord[],
  patterns: Record<string, RegExp>,
  options: ISpatialExtractionOptions,
): Record<string, ISpatialValue> {
  const lines = makeLines(words);
  const startLine = lines.find((line) => options.regionStart.test(line.text));

  if (!startLine) {
    return {};
  }

  const endLine = lines.find(
    (line) => line.top > startLine.bottom && options.regionEnd.test(line.text),
  );
  const regionBottom =
    endLine?.top ?? Math.min(1, startLine.bottom + (options.maxRegionHeight ?? 0.18));
  const labels = recognizedLabels(lines, patterns).filter(
    (label) => label.line.top >= startLine.top && label.line.bottom <= regionBottom,
  );
  const values: Record<string, ISpatialValue> = {};

  for (const label of labels) {
    const bounds = cellBounds(label, labels);
    const inlineWords = label.line.words.filter(
      (word) =>
        word.start >= label.end &&
        word.box.x + word.box.width > label.right &&
        word.box.x < bounds.right,
    );
    const inlineValue = lineValue(inlineWords, label, options.valuePattern);
    if (inlineValue) {
      values[label.key] = inlineValue;
      continue;
    }

    const nextLines = lines
      .filter(
        (line) =>
          line.top >= label.line.bottom &&
          line.top < regionBottom &&
          !options.regionEnd.test(line.text),
      )
      .sort((first, second) => first.top - second.top);

    for (const line of nextLines) {
      if (
        (!options.valuePattern && recognizedLabels([line], patterns).length > 0) ||
        NON_VALUE_LINE.test(line.text)
      ) {
        continue;
      }

      const candidates = line.words.filter((word) => {
        const center = word.box.x + word.box.width / 2;
        return center >= bounds.left && center <= bounds.right;
      });
      const spatialValue = lineValue(candidates, label, options.valuePattern);
      if (spatialValue) {
        values[label.key] = spatialValue;
        break;
      }
    }
  }

  logSpatialColumns(options.debug, values);
  return values;
}
