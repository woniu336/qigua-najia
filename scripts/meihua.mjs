/**
 * 梅花起卦：时间法（年月日时）＋ 两数法
 * =====================================
 * 纯确定性函数：取数、余数归一、上下卦、动爻、变卦、爻值编码全部在此完成。
 * 禁止任何 LLM 参与：模型既不做取数，也不做卦名反查。
 *
 * 口径（qigua-najia-v1，详见 references/method-spec.md）：
 *   时间法 S1 = 农历年支数 + 农历月数 + 农历日数
 *          S2 = S1 + 时支数
 *          上卦 = S1 % 8（0→8）  下卦 = S2 % 8（0→8）  动爻 = S2 % 6（0→6）
 *   两数法 上卦 = A % 8（0→8） 下卦 = B % 8（0→8）  动爻 = (A+B) % 6（0→6）
 *   先天数 1乾 2兑 3离 4震 5巽 6坎 7艮 8坤
 *
 * 历法口径（硬性）：
 *   - 年支取**农历年支**（正月初一换年）＝ lunar.getYearZhi()，
 *     绝不用 getYearZhiExact()（那是立春换年，属八字节气口径，禁止混入梅花取数）。
 *   - 月取农历月（闰月取绝对值，并在输出里标注 is_leap_month）；
 *     不用节气月，也不用月建。
 *   - 日取农历日；时取**时支**（子 1 … 亥 12）。
 *   - 换日口径：民用日 00:00 换日（23:00–23:59 属子时，农历日仍按当日民用日期）。
 */

import lunarPkg from 'lunar-javascript';
import { TRIGRAMS, SIXTY_FOUR_HEXAGRAMS } from './engine/najia.mjs';
import { fail, INVALID_INPUT, INTERNAL_CONSISTENCY_ERROR } from './errors.mjs';

const { Lunar } = lunarPkg;

/** 先天八卦数（《梅花易数·周易卦数》：乾一、兑二、离三、震四、巽五、坎六、艮七、坤八） */
export const XIANTIAN_NUMBER_TO_TRIGRAM = Object.freeze({
  1: '乾',
  2: '兑',
  3: '离',
  4: '震',
  5: '巽',
  6: '坎',
  7: '艮',
  8: '坤',
});

export const TRIGRAM_TO_XIANTIAN_NUMBER = Object.freeze(
  Object.fromEntries(Object.entries(XIANTIAN_NUMBER_TO_TRIGRAM).map(([n, t]) => [t, Number(n)])),
);

/** 十二地支序数：子 1 … 亥 12 */
export const BRANCH_NUMBER = Object.freeze({
  子: 1, 丑: 2, 寅: 3, 卯: 4, 辰: 5, 巳: 6,
  午: 7, 未: 8, 申: 9, 酉: 10, 戌: 11, 亥: 12,
});

/* ------------------------------------------------------------------ */
/* 余数归一（整数精确运算；同时接受 number 与 BigInt）                  */
/* ------------------------------------------------------------------ */

function toBigInt(value, label) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      fail(INVALID_INPUT, `${label} 必须是整数，收到 ${value}`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!/^\d+$/.test(s)) fail(INVALID_INPUT, `${label} 必须是正整数，收到 "${value}"`);
    return BigInt(s);
  }
  fail(INVALID_INPUT, `${label} 必须是正整数，收到 ${typeof value}`);
  return 0n;
}

/** 正整数解析：拒绝负数、小数、空值、非数字字符（设计稿 §方式 B 引导规则 5） */
export function parsePositiveInteger(value, label) {
  const v = toBigInt(value, label);
  if (v <= 0n) fail(INVALID_INPUT, `${label} 必须是正整数（> 0），收到 ${v.toString()}`);
  return v;
}

/** 除八取卦：余数为 0 时取 8（《卦以八除》） */
export function remainderToEight(value) {
  const v = toBigInt(value, '被除数');
  const r = ((v % 8n) + 8n) % 8n;
  return r === 0n ? 8 : Number(r);
}

/** 除六取爻：余数为 0 时取 6（《爻以六除》） */
export function remainderToSix(value) {
  const v = toBigInt(value, '被除数');
  const r = ((v % 6n) + 6n) % 6n;
  return r === 0n ? 6 : Number(r);
}

/* ------------------------------------------------------------------ */
/* 爻画工具                                                            */
/* ------------------------------------------------------------------ */

/** 本卦爻值（6/7/8/9）编码：静阳 7 / 静阴 8 / 动阳 9 / 动阴 6 */
export function lineValuesFromBinary(binary, movingLines = []) {
  const moving = new Set(movingLines);
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    const isYang = binary[i] === '1';
    const isMoving = moving.has(i + 1);
    out.push(isYang ? (isMoving ? 9 : 7) : isMoving ? 6 : 8);
  }
  return out;
}

/** 翻转指定爻位（1=初爻 … 6=上爻）的阴阳，其余保持 */
export function flipBinary(binary, positions) {
  const chars = binary.split('');
  for (const pos of positions) {
    if (!Number.isInteger(pos) || pos < 1 || pos > 6) {
      fail(INVALID_INPUT, `动爻位置必须是 1–6 的整数，收到 ${pos}`);
    }
    chars[pos - 1] = chars[pos - 1] === '1' ? '0' : '1';
  }
  return chars.join('');
}

/** 上下卦 → 初爻→上爻二进制（内卦在前，外卦在后） */
export function binaryFromTrigrams(lower, upper) {
  const l = TRIGRAMS[lower];
  const u = TRIGRAMS[upper];
  if (!l || !u) fail(INVALID_INPUT, `未知经卦：下卦=${lower} 上卦=${upper}`);
  return l.binary + u.binary;
}

function nameOfBinary(binary) {
  const entry = SIXTY_FOUR_HEXAGRAMS[binary];
  if (!entry) fail(INTERNAL_CONSISTENCY_ERROR, `六十四卦表查不到二进制 ${binary}`);
  return entry.name;
}

/**
 * 由「上卦数、下卦数、动爻位」组装完整卦象（梅花两法共用）。
 * 梅花两法**恰好一条动爻**；变卦只翻该爻。
 */
export function assembleMeihuaHexagram({ upperNumber, lowerNumber, movingPosition }) {
  const upper = XIANTIAN_NUMBER_TO_TRIGRAM[upperNumber];
  const lower = XIANTIAN_NUMBER_TO_TRIGRAM[lowerNumber];
  if (!upper || !lower) {
    fail(INVALID_INPUT, `八卦数必须是 1–8，收到 上=${upperNumber} 下=${lowerNumber}`);
  }
  if (!Number.isInteger(movingPosition) || movingPosition < 1 || movingPosition > 6) {
    fail(INVALID_INPUT, `动爻位必须是 1–6，收到 ${movingPosition}`);
  }

  const binary = binaryFromTrigrams(lower, upper);
  const movingLines = [movingPosition];
  const changedBinary = flipBinary(binary, movingLines);
  const lineValues = lineValuesFromBinary(binary, movingLines);

  return {
    upper,
    lower,
    upper_number: upperNumber,
    lower_number: lowerNumber,
    binary,
    name: nameOfBinary(binary),
    moving_lines: movingLines,
    changed_binary: changedBinary,
    changed_name: nameOfBinary(changedBinary),
    line_values_bottom_up: lineValues,
    is_static: false,
  };
}

/* ------------------------------------------------------------------ */
/* 时间法                                                              */
/* ------------------------------------------------------------------ */

/**
 * 从「已锁定为用户当地墙上时间」的 Date 读出农历四要素。
 * 调用方必须保证 date 的本地年月日时分 = 目标时区的墙上时间（见 cast.mjs::resolveWallClock）。
 */
export function lunarFields(dateObj) {
  const lunar = Lunar.fromDate(dateObj);
  const rawMonth = lunar.getMonth(); // 闰月返回负数
  const isLeap = rawMonth < 0;
  const lunarMonth = Math.abs(rawMonth);
  const lunarDay = lunar.getDay();
  const yearZhi = lunar.getYearZhi(); // ✅ 正月初一换年
  const yearZhiExact = lunar.getYearZhiExact(); // ⛔ 仅记录备查，不参与取数
  const hourZhi = lunar.getTimeZhi();

  if (!BRANCH_NUMBER[yearZhi]) fail(INTERNAL_CONSISTENCY_ERROR, `农历年支不合法：${yearZhi}`);
  if (!BRANCH_NUMBER[hourZhi]) fail(INTERNAL_CONSISTENCY_ERROR, `时支不合法：${hourZhi}`);
  if (!(lunarMonth >= 1 && lunarMonth <= 12)) {
    fail(INTERNAL_CONSISTENCY_ERROR, `农历月不合法：${rawMonth}`);
  }
  if (!(lunarDay >= 1 && lunarDay <= 30)) {
    fail(INTERNAL_CONSISTENCY_ERROR, `农历日不合法：${lunarDay}`);
  }

  return {
    year_zhi: yearZhi,
    year_zhi_number: BRANCH_NUMBER[yearZhi],
    year_zhi_exact_reference_only: yearZhiExact,
    lunar_month: lunarMonth,
    lunar_month_raw: rawMonth,
    is_leap_month: isLeap,
    lunar_month_text: lunar.getMonthInChinese(),
    lunar_day: lunarDay,
    lunar_day_text: lunar.getDayInChinese(),
    hour_zhi: hourZhi,
    hour_zhi_number: BRANCH_NUMBER[hourZhi],
    lunar_text: `${lunar.getYearInChinese()}年 农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
  };
}

/** 时间法取数（纯数值，不做历法转换） */
export function meihuaTimeNumbers({ yearZhiNumber, lunarMonth, lunarDay, hourZhiNumber }) {
  const S1 = BigInt(yearZhiNumber) + BigInt(lunarMonth) + BigInt(lunarDay);
  const S2 = S1 + BigInt(hourZhiNumber);
  return {
    S1: S1.toString(),
    S2: S2.toString(),
    upper_remainder: remainderToEight(S1),
    lower_remainder: remainderToEight(S2),
    moving_remainder: remainderToSix(S2),
  };
}

/**
 * 梅花时间法完整起卦。
 * @param {Date} dateObj 本地年月日时分 = 目标时区墙上时间的 Date
 */
export function castMeihuaTime(dateObj) {
  const fields = lunarFields(dateObj);
  const numbers = meihuaTimeNumbers({
    yearZhiNumber: fields.year_zhi_number,
    lunarMonth: fields.lunar_month,
    lunarDay: fields.lunar_day,
    hourZhiNumber: fields.hour_zhi_number,
  });
  const hexagram = assembleMeihuaHexagram({
    upperNumber: numbers.upper_remainder,
    lowerNumber: numbers.lower_remainder,
    movingPosition: numbers.moving_remainder,
  });

  return {
    method: 'MEIHUA_TIME',
    calendar: fields,
    numbers: {
      year_zhi: fields.year_zhi,
      year_zhi_number: fields.year_zhi_number,
      lunar_month: fields.lunar_month,
      lunar_month_abs: fields.lunar_month,
      is_leap_month: fields.is_leap_month,
      lunar_day: fields.lunar_day,
      hour_zhi: fields.hour_zhi,
      hour_zhi_number: fields.hour_zhi_number,
      S1: numbers.S1,
      S2: numbers.S2,
      upper_remainder: numbers.upper_remainder,
      lower_remainder: numbers.lower_remainder,
      moving_remainder: numbers.moving_remainder,
      formula: 'S1=年支+农历月+农历日；S2=S1+时支；上卦=S1%8(0→8)；下卦=S2%8(0→8)；动爻=S2%6(0→6)',
    },
    hexagram,
  };
}

/* ------------------------------------------------------------------ */
/* 两数法                                                              */
/* ------------------------------------------------------------------ */

/**
 * 梅花两数法完整起卦。
 * A → 上卦，B → 下卦，动爻 = (A+B) % 6；不加时辰、不换第三数。
 * 内部全程 BigInt，绝不用浮点。
 */
export function castMeihuaTwoNumbers(aRaw, bRaw) {
  const A = parsePositiveInteger(aRaw, '第一数 A');
  const B = parsePositiveInteger(bRaw, '第二数 B');
  const sum = A + B;

  const numbers = {
    A: A.toString(),
    B: B.toString(),
    sum: sum.toString(),
    upper_remainder: remainderToEight(A),
    lower_remainder: remainderToEight(B),
    moving_remainder: remainderToSix(sum),
    formula: '上卦=A%8(0→8)；下卦=B%8(0→8)；动爻=(A+B)%6(0→6)',
  };

  const hexagram = assembleMeihuaHexagram({
    upperNumber: numbers.upper_remainder,
    lowerNumber: numbers.lower_remainder,
    movingPosition: numbers.moving_remainder,
  });

  return { method: 'MEIHUA_TWO_NUMBERS', numbers, hexagram };
}
