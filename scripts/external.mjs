/**
 * 外部卦象输入标准化器 + 冲突检测
 * ================================
 * 用途：用户已经通过铜钱手摇、蓍草、第三方排盘软件或其他工具得到卦象，
 * 本模块把这个结果**确定性**地标准化成纳甲引擎可消费的爻值数组。
 *
 * 这不是梅花起卦：不取数、不算年月日时、不套「恰好一条动爻」限制。
 * 允许 0–6 条动爻；静卦就是静卦（changed = null），不许伪造「本卦=变卦」的假变卦；
 * 多动爻全部保留，不许压成一条，也不许只挑一个「主要动爻」。
 *
 * 四种输入模式（设计稿 §方式 C）：
 *   SIX_LINE_VALUES            六爻爻值 [6|7|8|9] × 6（初爻→上爻）
 *   ORIGINAL_PLUS_CHANGED      本卦 + 变卦（逐位比较反推动爻与爻值）
 *   ORIGINAL_PLUS_MOVING_LINES 本卦 + 动爻位置（翻转全部指定爻位生成变卦）
 *   ORIGINAL_STATIC            本卦 + 明确静卦声明
 */

import { SIXTY_FOUR_HEXAGRAMS } from './engine/najia.mjs';
import {
  fail,
  INVALID_INPUT,
  MISSING_CHANGE_INFORMATION,
  CONFLICTING_HEXAGRAM_INPUT,
  INTERNAL_CONSISTENCY_ERROR,
} from './errors.mjs';

export const INPUT_MODES = Object.freeze([
  'SIX_LINE_VALUES',
  'ORIGINAL_PLUS_CHANGED',
  'ORIGINAL_PLUS_MOVING_LINES',
  'ORIGINAL_STATIC',
]);

export const INPUT_MODE_LABELS = Object.freeze({
  SIX_LINE_VALUES: '六爻爻值（6/7/8/9，初爻→上爻）',
  ORIGINAL_PLUS_CHANGED: '本卦+变卦（自动反推动爻）',
  ORIGINAL_PLUS_MOVING_LINES: '本卦+动爻（自动生成变卦）',
  ORIGINAL_STATIC: '本卦+明确静卦',
});

export const ACQUISITION_METHODS = Object.freeze(['COIN_TOSS', 'YARROW', 'EXTERNAL_APP', 'OTHER', 'UNKNOWN']);

export const ACQUISITION_LABELS = Object.freeze({
  COIN_TOSS: '铜钱手摇',
  YARROW: '蓍草',
  EXTERNAL_APP: '第三方排盘软件',
  OTHER: '其他方法',
  UNKNOWN: '未知',
});

/** 卦名 → 二进制（初爻→上爻）反查表，键为六十四卦全名，如「泽火革」 */
const NAME_TO_BINARY = new Map(
  Object.entries(SIXTY_FOUR_HEXAGRAMS).map(([binary, entry]) => [entry.name, binary]),
);

export function hexagramBinaryByName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    fail(INVALID_INPUT, '卦名必须是非空字符串');
  }
  const key = name.trim();
  const binary = NAME_TO_BINARY.get(key);
  if (!binary) {
    fail(INVALID_INPUT, `无法唯一映射到六十四卦的卦名："${key}"（须为全名，如「泽火革」「风火家人」）`);
  }
  return binary;
}

export function hexagramNameByBinary(binary) {
  const entry = SIXTY_FOUR_HEXAGRAMS[binary];
  if (!entry) fail(INTERNAL_CONSISTENCY_ERROR, `六十四卦表查不到二进制 ${binary}`);
  return entry.name;
}

/** 二进制 → 阴阳爻数组（布尔，初爻→上爻） */
export function yangArray(binary) {
  return binary.split('').map((c) => c === '1');
}

/** 二进制 → 卦名（供外部核对用） */
export function describeBinary(binary) {
  const entry = SIXTY_FOUR_HEXAGRAMS[binary];
  return {
    hexagram_id: binary,
    name: entry ? entry.name : null,
    lines_bottom_up: binary.split('').map((c) => (c === '1' ? '阳' : '阴')),
  };
}

/** 本卦 + 变卦 → 动爻位置（逐位比较，1 起） */
export function movingLinesBetween(baseBinary, changedBinary) {
  const moving = [];
  for (let i = 0; i < 6; i += 1) {
    if (baseBinary[i] !== changedBinary[i]) moving.push(i + 1);
  }
  return moving;
}

/** 本卦爻 + 动爻 → 爻值（阳变阴=9 老阳，阴变阳=6 老阴，静阳 7，静阴 8） */
export function encodeLineValues(baseBinary, movingLines) {
  const moving = new Set(movingLines);
  const values = [];
  for (let i = 0; i < 6; i += 1) {
    const isYang = baseBinary[i] === '1';
    const isMoving = moving.has(i + 1);
    values.push(isYang ? (isMoving ? 9 : 7) : isMoving ? 6 : 8);
  }
  return values;
}

/** 爻值 → 本卦/变卦二进制 + 动爻 */
export function decodeLineValues(values) {
  if (!Array.isArray(values) || values.length !== 6) {
    fail(INVALID_INPUT, `六爻爻值必须是长度 6 的数组（初爻→上爻），收到 ${JSON.stringify(values)}`);
  }
  let base = '';
  let changed = '';
  const moving = [];
  values.forEach((raw, idx) => {
    const v = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
    if (![6, 7, 8, 9].includes(v)) {
      fail(INVALID_INPUT, `第 ${idx + 1} 爻爻值必须是 6/7/8/9，收到 ${JSON.stringify(raw)}`);
    }
    const isYang = v === 7 || v === 9;
    const isMoving = v === 6 || v === 9;
    base += isYang ? '1' : '0';
    changed += (isMoving ? !isYang : isYang) ? '1' : '0';
    if (isMoving) moving.push(idx + 1);
  });
  return { base, changed, moving, isStatic: moving.length === 0 };
}

function normalizeMovingLines(raw) {
  if (!Array.isArray(raw)) fail(INVALID_INPUT, 'moving_lines 必须是数组（可为空数组）');
  const out = [];
  for (const item of raw) {
    const v = typeof item === 'string' && /^\d+$/.test(item.trim()) ? Number(item.trim()) : item;
    if (!Number.isInteger(v) || v < 1 || v > 6) {
      fail(INVALID_INPUT, `动爻位置必须是 1–6 的整数，收到 ${JSON.stringify(item)}`);
    }
    if (out.includes(v)) fail(INVALID_INPUT, `动爻位置重复：${v}`);
    out.push(v);
  }
  return out.sort((a, b) => a - b);
}

function sameSet(a, b) {
  const A = [...a].sort((x, y) => x - y);
  const B = [...b].sort((x, y) => x - y);
  return A.length === B.length && A.every((v, i) => v === B[i]);
}

/**
 * 推断输入模式（仅在调用方未显式给出 input_mode 时使用）。
 * 完全确定性：只按字段存在性判定，不猜内容；无法判定时失败关闭。
 */
export function inferInputMode(input) {
  const hasValues = input.six_line_values !== undefined || input.line_values !== undefined;
  const hasOriginal = typeof input.original_hexagram === 'string' && input.original_hexagram.trim();
  const hasChanged = typeof input.changed_hexagram === 'string' && input.changed_hexagram.trim();
  const hasMoving = Array.isArray(input.moving_lines);
  const declaresStatic = input.is_static === true || input.static === true;

  if (hasValues) return 'SIX_LINE_VALUES';
  if (hasOriginal && hasChanged) return 'ORIGINAL_PLUS_CHANGED';
  if (hasOriginal && hasMoving) return 'ORIGINAL_PLUS_MOVING_LINES';
  if (hasOriginal && declaresStatic) return 'ORIGINAL_STATIC';
  if (hasOriginal) {
    fail(
      MISSING_CHANGE_INFORMATION,
      '只给了本卦，既没有变卦也没有动爻，也没有「静卦（无动爻）」声明。缺什么就补什么，不得默认按静卦处理。',
      { original_hexagram: input.original_hexagram },
    );
  }
  fail(INVALID_INPUT, '外部卦象输入缺少必要字段：six_line_values / original_hexagram+changed_hexagram / original_hexagram+moving_lines / original_hexagram+is_static');
}

/**
 * 标准化外部卦象输入。
 * @param {object} input
 * @param {'SIX_LINE_VALUES'|'ORIGINAL_PLUS_CHANGED'|'ORIGINAL_PLUS_MOVING_LINES'|'ORIGINAL_STATIC'} [input.input_mode]
 * @param {number[]} [input.six_line_values] 六爻爻值，初爻→上爻
 * @param {string} [input.original_hexagram] 本卦全名
 * @param {string} [input.changed_hexagram] 变卦全名
 * @param {number[]} [input.moving_lines] 动爻位置 1–6（可为空数组）
 * @param {boolean} [input.is_static] 明确静卦声明
 * @param {string} [input.acquisition_method] 外部取得方式
 */
export function normalizeExternal(input) {
  if (!input || typeof input !== 'object') fail(INVALID_INPUT, '外部卦象输入必须是 JSON 对象');

  const declaredMode = input.input_mode ? String(input.input_mode).trim().toUpperCase() : null;
  if (declaredMode && !INPUT_MODES.includes(declaredMode)) {
    fail(INVALID_INPUT, `未知 input_mode："${input.input_mode}"，允许值：${INPUT_MODES.join(' / ')}`);
  }
  const mode = declaredMode ?? inferInputMode(input);
  const acquisition = input.acquisition_method ? String(input.acquisition_method).trim().toUpperCase() : 'UNKNOWN';
  if (!ACQUISITION_METHODS.includes(acquisition)) {
    fail(INVALID_INPUT, `未知 acquisition_method："${input.acquisition_method}"，允许值：${ACQUISITION_METHODS.join(' / ')}`);
  }

  const notes = [];
  const rawValues = input.six_line_values ?? input.line_values;
  let baseBinary;
  let changedBinary = null;
  let movingLines;
  let suppliedValues = null;

  if (rawValues !== undefined) {
    const decoded = decodeLineValues(rawValues);
    baseBinary = decoded.base;
    changedBinary = decoded.isStatic ? null : decoded.changed;
    movingLines = decoded.moving;
    suppliedValues = rawValues.map((v) => Number(String(v).trim()));
  }

  // 显式模式校验（字段齐备性）
  if (mode === 'SIX_LINE_VALUES' && suppliedValues === null) {
    fail(INVALID_INPUT, 'input_mode=SIX_LINE_VALUES 但缺少 six_line_values');
  }
  if (mode === 'ORIGINAL_PLUS_CHANGED') {
    if (typeof input.original_hexagram !== 'string' || typeof input.changed_hexagram !== 'string') {
      fail(INVALID_INPUT, 'input_mode=ORIGINAL_PLUS_CHANGED 需要 original_hexagram 与 changed_hexagram');
    }
  }
  if (mode === 'ORIGINAL_PLUS_MOVING_LINES') {
    if (typeof input.original_hexagram !== 'string') {
      fail(INVALID_INPUT, 'input_mode=ORIGINAL_PLUS_MOVING_LINES 需要 original_hexagram');
    }
    if (!Array.isArray(input.moving_lines)) {
      fail(INVALID_INPUT, 'input_mode=ORIGINAL_PLUS_MOVING_LINES 需要 moving_lines 数组（明确静卦请用空数组 + is_static=true，或 input_mode=ORIGINAL_STATIC）');
    }
  }
  if (mode === 'ORIGINAL_STATIC') {
    if (typeof input.original_hexagram !== 'string') {
      fail(INVALID_INPUT, 'input_mode=ORIGINAL_STATIC 需要 original_hexagram');
    }
    if (input.is_static !== true && input.static !== true) {
      fail(INVALID_INPUT, 'input_mode=ORIGINAL_STATIC 必须同时给出 is_static=true 的显式静卦声明');
    }
  }

  // 由本卦名推出爻画，并与已解码结果交叉核对
  const originalFromName = input.original_hexagram ? hexagramBinaryByName(input.original_hexagram) : null;
  const changedFromName = input.changed_hexagram ? hexagramBinaryByName(input.changed_hexagram) : null;

  if (baseBinary === undefined) {
    baseBinary = originalFromName;
  } else if (originalFromName && originalFromName !== baseBinary) {
    fail(
      CONFLICTING_HEXAGRAM_INPUT,
      `爻值与本卦名互相矛盾：爻值推出 ${hexagramNameByBinary(baseBinary)}（${baseBinary}），但 original_hexagram 是 ${input.original_hexagram}（${originalFromName}）`,
      { from_values: hexagramNameByBinary(baseBinary), from_name: input.original_hexagram },
    );
  }

  if (baseBinary === undefined) {
    // 未给任何可用本卦信息
    fail(INVALID_INPUT, '外部卦象输入未能确定本卦');
  }

  if (mode === 'ORIGINAL_PLUS_CHANGED') {
    const fromDiff = movingLinesBetween(originalFromName, changedFromName);
    const derivedChanged = fromDiff.length ? changedFromName : null;
    if (changedBinary !== null && changedBinary !== derivedChanged) {
      fail(
        CONFLICTING_HEXAGRAM_INPUT,
        `爻值推出的变卦与本卦+变卦不一致：爻值→${changedBinary ? hexagramNameByBinary(changedBinary) : '静卦'}，本变卦→${derivedChanged ? hexagramNameByBinary(derivedChanged) : '静卦'}`,
      );
    }
    const declaredMoving = Array.isArray(input.moving_lines) ? normalizeMovingLines(input.moving_lines) : null;
    if (declaredMoving && !sameSet(declaredMoving, fromDiff)) {
      fail(
        CONFLICTING_HEXAGRAM_INPUT,
        `本卦与变卦逐位比较得到动爻 [${fromDiff.join(',')}]，但用户声明的 moving_lines 是 [${declaredMoving.join(',')}]`,
      );
    }
    movingLines = fromDiff;
    changedBinary = derivedChanged;
    if (originalFromName === changedFromName) {
      notes.push('本卦与变卦相同：按静卦处理（无动爻、无变卦），未虚构动爻');
    }
  }

  if (mode === 'ORIGINAL_PLUS_MOVING_LINES') {
    const declaredMoving = normalizeMovingLines(input.moving_lines);
    const declaresStatic = input.is_static === true || input.static === true;
    if (declaredMoving.length === 0) {
      if (!declaresStatic) {
        fail(
          MISSING_CHANGE_INFORMATION,
          'moving_lines 为空但没有静卦声明。静卦必须显式声明（input_mode=ORIGINAL_STATIC 或 is_static=true），不得默认当作静卦。',
        );
      }
      movingLines = [];
      changedBinary = null;
      notes.push('用户显式声明静卦：moving_lines=[]，无变卦');
    } else {
      if (declaresStatic) {
        fail(CONFLICTING_HEXAGRAM_INPUT, `同时声明了静卦 is_static=true 和非空动爻 [${declaredMoving.join(',')}]`);
      }
      movingLines = declaredMoving;
      changedBinary = flipBinarySafe(originalFromName, declaredMoving);
      notes.push('变卦由本卦翻转全部指定动爻生成（非用户手填卦名）');
    }
    if (suppliedValues !== null) {
      const derivedValues = encodeLineValues(baseBinary, movingLines);
      if (!sameSet(declaredMoving, movingLinesFromValues(suppliedValues))) {
        fail(CONFLICTING_HEXAGRAM_INPUT, '爻值与 moving_lines 推出的动爻集合不一致');
      }
      if (derivedValues.join(',') !== suppliedValues.join(',')) {
        fail(CONFLICTING_HEXAGRAM_INPUT, `爻值与本卦+动爻推出的标准爻值不一致：${suppliedValues.join(',')} vs ${derivedValues.join(',')}`);
      }
    }
  }

  if (mode === 'ORIGINAL_STATIC') {
    if (changedFromName && changedFromName !== originalFromName) {
      fail(CONFLICTING_HEXAGRAM_INPUT, '声明静卦却给出了不同的变卦');
    }
    const declaredMoving = Array.isArray(input.moving_lines) ? normalizeMovingLines(input.moving_lines) : [];
    if (declaredMoving.length) {
      fail(CONFLICTING_HEXAGRAM_INPUT, `声明静卦却给出了动爻 [${declaredMoving.join(',')}]`);
    }
    movingLines = [];
    changedBinary = null;
  }

  // 用户额外提供的变卦名（核对信息）必须与推导结果完全一致
  if (changedFromName && mode !== 'ORIGINAL_PLUS_CHANGED') {
    const expectedChangedName = changedBinary ? hexagramNameByBinary(changedBinary) : hexagramNameByBinary(baseBinary);
    if (changedFromName !== expectedChangedName) {
      fail(
        CONFLICTING_HEXAGRAM_INPUT,
        `用户给出的变卦 ${input.changed_hexagram} 与推导结果不一致：推导为 ${changedBinary ? expectedChangedName : `${expectedChangedName}（静卦，无变卦）`}`,
      );
    }
    if (changedBinary === null && changedFromName === hexagramNameByBinary(baseBinary)) {
      notes.push('用户给出的变卦与本卦相同，且推导为静卦：一致');
    }
  }

  // 统一收口校验
  if (!Array.isArray(movingLines)) movingLines = [];
  movingLines = [...movingLines].sort((a, b) => a - b);
  for (const pos of movingLines) {
    if (!Number.isInteger(pos) || pos < 1 || pos > 6) fail(INVALID_INPUT, `动爻位置越界：${pos}`);
  }
  if (new Set(movingLines).size !== movingLines.length) fail(INTERNAL_CONSISTENCY_ERROR, '动爻位置重复');

  const expectedChanged = movingLines.length ? flipBinarySafe(baseBinary, movingLines) : null;
  if (expectedChanged !== changedBinary) {
    fail(
      INTERNAL_CONSISTENCY_ERROR,
      `变卦与翻转全部动爻的结果不一致：期望 ${expectedChanged ?? 'null（静卦）'}，实际 ${changedBinary ?? 'null'}`,
    );
  }

  const isStatic = movingLines.length === 0;
  if (isStatic && changedBinary !== null) {
    fail(INTERNAL_CONSISTENCY_ERROR, '静卦不得携带变卦');
  }

  const baseValues = encodeLineValues(baseBinary, movingLines);
  if (suppliedValues !== null && baseValues.join(',') !== suppliedValues.join(',')) {
    fail(
      CONFLICTING_HEXAGRAM_INPUT,
      `爻值与推导结果不一致：输入 ${suppliedValues.join(',')}，推导 ${baseValues.join(',')}`,
    );
  }

  return {
    source_method: 'EXTERNAL_HEXAGRAM_INPUT',
    input_mode: mode,
    input_mode_label: INPUT_MODE_LABELS[mode],
    acquisition_method: acquisition,
    acquisition_label: ACQUISITION_LABELS[acquisition],
    original_hexagram_id: baseBinary,
    original_hexagram_name: hexagramNameByBinary(baseBinary),
    line_values_bottom_up: baseValues,
    supplied_line_values: suppliedValues,
    moving_lines: movingLines,
    is_static: isStatic,
    changed_hexagram_id: changedBinary,
    changed_hexagram_name: changedBinary ? hexagramNameByBinary(changedBinary) : null,
    moving_lines_echo: movingLines.map((pos) => ({
      position: pos,
      position_label: ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'][pos - 1],
      original: baseBinary[pos - 1] === '1' ? '阳' : '阴',
      changed: isStatic ? null : baseBinary[pos - 1] === '1' ? '阴' : '阳',
    })),
    echo: {
      original_hexagram: input.original_hexagram ?? null,
      changed_hexagram: input.changed_hexagram ?? null,
      six_line_values: rawValues ?? null,
      moving_lines: Array.isArray(input.moving_lines) ? input.moving_lines : null,
      is_static: input.is_static === true || input.static === true,
      notes: Array.isArray(input.notes) ? input.notes : undefined,
    },
    checks: {
      name_to_hexagram_unique: true,
      lines_bottom_up_order: '初爻→上爻（自下而上）',
      changed_equals_flip_of_all_moving_lines: true,
      fake_changed_hexagram_absent: isStatic ? changedBinary === null : true,
      multi_moving_lines_preserved: movingLines.length <= 1 ? true : 'all kept',
    },
    notes,
  };
}

function flipBinarySafe(binary, positions) {
  const chars = binary.split('');
  for (const pos of positions) chars[pos - 1] = chars[pos - 1] === '1' ? '0' : '1';
  const out = chars.join('');
  if (!SIXTY_FOUR_HEXAGRAMS[out]) fail(INTERNAL_CONSISTENCY_ERROR, `翻转后得到非法卦象：${out}`);
  return out;
}

function movingLinesFromValues(values) {
  const moving = [];
  values.forEach((v, idx) => {
    if (v === 6 || v === 9) moving.push(idx + 1);
  });
  return moving;
}
