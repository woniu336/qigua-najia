#!/usr/bin/env node
/**
 * cast.mjs —— 起卦入口 CLI（qigua-najia-v1）
 * ========================================
 * 链路：读入 JSON/参数 → 校验 → 确定性算卦（梅花两法 或 外部标准化）→
 *       调纳甲六爻引擎装卦 → 一致性闸门 → 输出「卦源说明 + 事实包」。
 *
 * 三种入口：
 *   1) 梅花年月日时   --time "2024-03-27 15:30" --tz Asia/Shanghai
 *   2) 梅花两数       --numbers 5 3
 *   3) 外部卦象       --external input.json
 *
 * 铁律：本文件不重算纳甲/世应/六亲/六神/旬空；一切盘面事实来自 copied engine。
 * 任何冲突/缺信息 → 抛 QiguaError 并退出码 2（失败关闭），不给「大概能用」的盘。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { castLiuyao, trigramsOfBinary } from './engine/najia.mjs';
import { castTimeInfo, buildLiuyaoInput } from './engine/ganzhi.mjs';
import { buildLiuyaoReadingFacts } from './engine/facts.mjs';
import { castMeihuaTime, castMeihuaTwoNumbers } from './meihua.mjs';
import { normalizeExternal } from './external.mjs';
import {
  QiguaError,
  fail,
  errorPayload,
  INVALID_INPUT,
  INTERNAL_CONSISTENCY_ERROR,
} from './errors.mjs';

export const ALGORITHM_VERSION = 'qigua-najia-v1';

const SOURCE_METHODS = ['MEIHUA_TIME', 'MEIHUA_TWO_NUMBERS', 'EXTERNAL_HEXAGRAM_INPUT'];

const POSITION_LABELS = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

const SOURCE_METHOD_LABELS = {
  MEIHUA_TIME: '梅花时间起卦（年月日时）',
  MEIHUA_TWO_NUMBERS: '梅花两数报数起卦',
  EXTERNAL_HEXAGRAM_INPUT: '外部卦象输入（非梅花起卦）',
};

const INPUT_MODE_BY_SOURCE = {
  MEIHUA_TIME: 'TIME',
  MEIHUA_TWO_NUMBERS: 'TWO_NUMBERS',
};

/* ------------------------------------------------------------------ */
/* 时区与时间解析（墙上时间 ↔ 瞬时）                                   */
/* ------------------------------------------------------------------ */

const WALL_CLOCK_RE =
  /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(Z|[+-]\d{2}:?\d{2})?$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function wallClockFromInstant(instant, timezone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant);
  } catch {
    fail(INVALID_INPUT, `无法识别的 IANA 时区："${timezone}"（例：Asia/Shanghai / America/Los_Angeles）`);
  }
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  return {
    y: get('year'),
    mo: get('month'),
    d: get('day'),
    h: hour,
    mi: get('minute'),
    s: get('second'),
  };
}

function wallClockKey(wc) {
  return `${wc.y}-${pad2(wc.mo)}-${pad2(wc.d)} ${pad2(wc.h)}:${pad2(wc.mi)}:${pad2(wc.s)}`;
}

function parseWallClockInput(value, label) {
  const m = WALL_CLOCK_RE.exec(value);
  if (!m) {
    fail(
      INVALID_INPUT,
      `${label} 时间格式不合法："${value}"（须为 YYYY-MM-DDTHH:mm 或 YYYY-MM-DD HH:mm，可选 :ss 与 ±HH:mm 偏移）`,
    );
  }
  const [, ys, mos, ds, hs, mis, ss, off] = m;
  const wc = {
    y: Number(ys),
    mo: Number(mos),
    d: Number(ds),
    h: Number(hs),
    mi: Number(mis),
    s: ss ? Number(ss) : 0,
  };
  if (wc.mo < 1 || wc.mo > 12) fail(INVALID_INPUT, `${label} 月份越界：${wc.mo}`);
  if (wc.d < 1 || wc.d > 31) fail(INVALID_INPUT, `${label} 日期越界：${wc.d}`);
  if (wc.h > 23 || wc.mi > 59 || wc.s > 59) fail(INVALID_INPUT, `${label} 时分秒越界`);

  let offsetMinutes = null;
  if (off) {
    if (off === 'Z') offsetMinutes = 0;
    else {
      const sign = off[0] === '-' ? -1 : 1;
      const body = off.slice(1).replace(':', '');
      offsetMinutes = sign * (Number(body.slice(0, 2)) * 60 + Number(body.slice(2, 4)));
    }
  }
  return { wc, offsetMinutes };
}

function instantFromWallClock(wc, timezone, label) {
  const want = Date.UTC(wc.y, wc.mo - 1, wc.d, wc.h, wc.mi, wc.s);
  let ts = want;
  for (let i = 0; i < 4; i += 1) {
    const asWall = wallClockFromInstant(new Date(ts), timezone);
    const asUTC = Date.UTC(asWall.y, asWall.mo - 1, asWall.d, asWall.h, asWall.mi, asWall.s);
    const delta = want - asUTC;
    if (delta === 0) break;
    ts += delta;
  }
  const check = wallClockFromInstant(new Date(ts), timezone);
  if (wallClockKey(check) !== wallClockKey(wc)) {
    fail(
      INVALID_INPUT,
      `${label} 时刻在时区 ${timezone} 中不存在（夏令时跳变的空档）：请求 ${wallClockKey(wc)}，该时区解析为 ${wallClockKey(check)}`,
    );
  }
  const ambiguous = wallClockKey(wallClockFromInstant(new Date(ts - 3600 * 1000), timezone)) === wallClockKey(wc);
  return { instant: new Date(ts), ambiguous };
}

/**
 * 把一个「时间字符串 + IANA 时区」解析成三样东西：
 *   - instant_iso     真实瞬时（UTC）
 *   - wall_clock      墙上时间文本
 *   - wall_clock_date Date，其**本地字段**恰好等于墙上时间（供 lunar-javascript 做农历换算，
 *                     从而不与运行机器的本地时区耦合）
 */
export function resolveMoment(value, timezone, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    fail(INVALID_INPUT, `缺少 ${label}（时间是排盘必需项，不得以当前时间或设备时区替代）`);
  }
  if (timezone === undefined || timezone === null || String(timezone).trim() === '') {
    fail(INVALID_INPUT, `缺少 ${label} 的 IANA 时区；不得用当前设备时区擅自替代`);
  }
  const tz = String(timezone).trim();
  const raw = String(value).trim();

  let instant;
  let ambiguous = false;
  let resolvedFrom;
  let wc;

  if (raw.toLowerCase() === 'now') {
    instant = new Date();
    wc = wallClockFromInstant(instant, tz);
    resolvedFrom = 'now（用户显式声明为当前时刻）';
  } else {
    const parsed = parseWallClockInput(raw, label);
    wc = parsed.wc;
    if (parsed.offsetMinutes !== null) {
      instant = new Date(Date.UTC(wc.y, wc.mo - 1, wc.d, wc.h, wc.mi, wc.s) - parsed.offsetMinutes * 60000);
      const inZone = wallClockFromInstant(instant, tz);
      if (wallClockKey(inZone) !== wallClockKey(wc)) {
        fail(
          INVALID_INPUT,
          `${label} 的 UTC 偏移与 IANA 时区 ${tz} 不符：按偏移解析为 ${wallClockKey(inZone)}（${tz}），但输入写的是 ${wallClockKey(wc)}`,
        );
      }
      resolvedFrom = '输入自带 UTC 偏移 + IANA 时区';
    } else {
      const r = instantFromWallClock(wc, tz, label);
      instant = r.instant;
      ambiguous = r.ambiguous;
      resolvedFrom = `按 IANA 时区 ${tz} 解释墙上时间`;
    }
  }

  const wall = wallClockFromInstant(instant, tz);
  return {
    input: raw,
    timezone: tz,
    instant_iso: instant.toISOString(),
    wall_clock: wallClockKey(wall),
    resolved_from: resolvedFrom,
    dst_ambiguous: ambiguous,
    wall_clock_date: new Date(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s),
  };
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function pickTimeSource(input, key) {
  const v = input[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function buildHexagramForMeihua(method, meihuaResult) {
  const h = meihuaResult.hexagram;
  const tris = trigramsOfBinary(h.binary);
  const changedTris = h.changed_binary ? trigramsOfBinary(h.changed_binary) : null;
  return {
    source_method: method,
    original_hexagram_id: h.binary,
    original_hexagram_name: h.name,
    base_binary: h.binary,
    upper_trigram: tris.upper,
    lower_trigram: tris.lower,
    upper_number: h.upper_number,
    lower_number: h.lower_number,
    line_values_bottom_up: h.line_values_bottom_up,
    moving_lines: h.moving_lines,
    is_static: false,
    changed_hexagram_id: h.changed_binary,
    changed_hexagram_name: h.changed_name,
    changed_binary: h.changed_binary,
    changed_upper_trigram: changedTris ? changedTris.upper : null,
    changed_lower_trigram: changedTris ? changedTris.lower : null,
  };
}

function buildHexagramForExternal(ext) {
  const tris = trigramsOfBinary(ext.original_hexagram_id);
  const changedTris = ext.changed_hexagram_id ? trigramsOfBinary(ext.changed_hexagram_id) : null;
  return {
    source_method: 'EXTERNAL_HEXAGRAM_INPUT',
    original_hexagram_id: ext.original_hexagram_id,
    original_hexagram_name: ext.original_hexagram_name,
    base_binary: ext.original_hexagram_id,
    upper_trigram: tris.upper,
    lower_trigram: tris.lower,
    line_values_bottom_up: ext.line_values_bottom_up,
    moving_lines: ext.moving_lines,
    is_static: ext.is_static,
    changed_hexagram_id: ext.changed_hexagram_id,
    changed_hexagram_name: ext.changed_hexagram_name,
    changed_binary: ext.changed_hexagram_id,
    changed_upper_trigram: changedTris ? changedTris.upper : null,
    changed_lower_trigram: changedTris ? changedTris.lower : null,
  };
}

function assertEngineMatches(chart, hexagram) {
  const problems = [];
  if (chart.base.binary !== hexagram.base_binary) {
    problems.push(`本卦二进制：引擎 ${chart.base.binary} ≠ 计算 ${hexagram.base_binary}`);
  }
  if (chart.base.name !== hexagram.original_hexagram_name) {
    problems.push(`本卦卦名：引擎 ${chart.base.name} ≠ 计算 ${hexagram.original_hexagram_name}`);
  }
  const engineMoving = chart.movingLines.join(',');
  const calcMoving = hexagram.moving_lines.join(',');
  if (engineMoving !== calcMoving) {
    problems.push(`动爻集合：引擎 [${engineMoving}] ≠ 计算 [${calcMoving}]`);
  }
  if (hexagram.is_static) {
    if (chart.changed !== null) problems.push('静卦：引擎却返回了变卦');
    if (chart.changedLines.length !== 0) problems.push('静卦：引擎却返回了变爻');
  } else {
    if (!chart.changed) problems.push('非静卦：引擎未返回变卦');
    else if (chart.changed.binary !== hexagram.changed_binary) {
      problems.push(`变卦二进制：引擎 ${chart.changed.binary} ≠ 计算 ${hexagram.changed_binary}`);
    }
  }
  if (chart.input.coins.join(',') !== hexagram.line_values_bottom_up.join(',')) {
    problems.push(`爻值：引擎 ${chart.input.coins.join(',')} ≠ 计算 ${hexagram.line_values_bottom_up.join(',')}`);
  }
  if (problems.length) {
    fail(INTERNAL_CONSISTENCY_ERROR, `纳甲引擎输出与起卦结果不一致：${problems.join('；')}`, { problems });
  }
  return {
    engine_matches_computation: true,
    checked: ['base_binary', 'base_name', 'moving_lines', 'changed_binary', 'static_has_no_changed', 'line_values'],
  };
}

/**
 * 执行一次完整起卦（供 CLI 与测试共用）。
 * @param {object} input 见 references/engine-contract.md
 */
export function runCast(input) {
  if (!input || typeof input !== 'object') fail(INVALID_INPUT, '输入必须是 JSON 对象');

  const sourceMethod = String(input.source_method ?? '').trim().toUpperCase();
  if (!SOURCE_METHODS.includes(sourceMethod)) {
    fail(INVALID_INPUT, `source_method 必须是 ${SOURCE_METHODS.join(' / ')} 之一，收到 ${JSON.stringify(input.source_method)}`);
  }
  const question = typeof input.question === 'string' ? input.question.trim() : '';

  /* --- 梅花取数时间（仅 MEIHUA_TIME 有） --- */
  let meihuaMoment = null;
  let meihua = null;
  let external = null;
  let hexagram;

  if (sourceMethod === 'MEIHUA_TIME') {
    meihuaMoment = resolveMoment(
      input.meihua_reference_time ?? input.time,
      input.meihua_timezone ?? input.timezone,
      '梅花取数时间（meihua_reference_time）',
    );
    meihua = castMeihuaTime(meihuaMoment.wall_clock_date);
    hexagram = buildHexagramForMeihua(sourceMethod, meihua);
  } else if (sourceMethod === 'MEIHUA_TWO_NUMBERS') {
    const two = input.two_numbers ?? input.numbers;
    let a;
    let b;
    if (Array.isArray(two)) {
      [a, b] = two;
    } else if (two && typeof two === 'object') {
      a = two.a ?? two.first;
      b = two.b ?? two.second;
    }
    if (a === undefined || b === undefined) {
      fail(INVALID_INPUT, 'MEIHUA_TWO_NUMBERS 需要两个正整数：two_numbers: [A, B] 或 {a, b}');
    }
    meihua = castMeihuaTwoNumbers(a, b);
    hexagram = buildHexagramForMeihua(sourceMethod, meihua);
  } else {
    if (!input.external || typeof input.external !== 'object') {
      fail(INVALID_INPUT, 'EXTERNAL_HEXAGRAM_INPUT 需要 external 对象（六爻爻值 / 本卦+变卦 / 本卦+动爻 / 本卦+静卦）');
    }
    if (input.meihua_reference_time) {
      fail(
        INVALID_INPUT,
        '外部卦象输入不得携带 meihua_reference_time：该来源不做梅花取数，不能伪造梅花取数时间',
      );
    }
    external = normalizeExternal(input.external);
    hexagram = buildHexagramForExternal(external);
  }

  /* --- 纳甲排盘基准时间（所有来源都必须有） --- */
  const najiaCastAtRaw = input.najia_cast_at ?? input.najia_cast_time;
  const najiaTzRaw = input.najia_timezone ?? input.timezone ?? input.meihua_timezone;

  const najiaMoment = resolveMoment(
    najiaCastAtRaw ?? (sourceMethod === 'MEIHUA_TIME' ? meihuaMoment.input : undefined),
    najiaTzRaw,
    '纳甲起卦时间（najia_cast_at）',
  );

  /* --- 调纳甲引擎 --- */
  const time = castTimeInfo(najiaMoment.wall_clock_date);
  const chart = castLiuyao(buildLiuyaoInput(time, hexagram.line_values_bottom_up));
  const consistency = assertEngineMatches(chart, hexagram);
  const facts = buildLiuyaoReadingFacts(chart, time, question);

  /* --- 组装输出 --- */
  const source = {
    source_method: sourceMethod,
    source_method_label: SOURCE_METHOD_LABELS[sourceMethod],
    acquisition_method: external ? external.acquisition_method : 'MEIHUA_COMPUTED',
    acquisition_label: external
      ? external.acquisition_label
      : '确定性代码计算（非铜钱摇卦、非蓍草、非外部工具）',
    input_mode: external ? external.input_mode : INPUT_MODE_BY_SOURCE[sourceMethod],
    input_mode_label: external
      ? external.input_mode_label
      : sourceMethod === 'MEIHUA_TIME'
        ? '时间（年支/农历月/农历日/时支）'
        : '两数（A 定上卦、B 定下卦、(A+B) 定动爻）',
    najia_engine: '京房纳甲六爻引擎（由 liuyao/bazi-web NajiaEngine 编译复制，未改任何规则）',
    engine_provenance: 'scripts/engine/najia.mjs ← liuyao/lib/liuyao/najia.ts',
    duangua_system: '纳甲六爻（京房纳甲 · 世应 · 六亲 · 六神 · 旬空 · 伏神）',
    fact_source: '确定性排盘引擎输出；本 Skill 不重算纳甲/世应/六亲/六神/旬空/月建日辰',
    algorithm_version: ALGORITHM_VERSION,
    meihua_time_source: sourceMethod === 'MEIHUA_TIME' ? pickTimeSource(input, 'meihua_time_source') : null,
    najia_time_source: pickTimeSource(input, 'najia_time_source'),
    question,
  };

  const meihuaPayload = meihua
    ? {
        method: meihua.method,
        reference_time: meihuaMoment
          ? {
              input: meihuaMoment.input,
              timezone: meihuaMoment.timezone,
              wall_clock: meihuaMoment.wall_clock,
              utc: meihuaMoment.instant_iso,
              resolved_from: meihuaMoment.resolved_from,
              dst_ambiguous: meihuaMoment.dst_ambiguous,
              source_note: source.meihua_time_source,
            }
          : null,
        numbers: meihua.numbers,
        calendar: meihua.calendar ?? null,
        hexagram: meihua.hexagram,
      }
    : null;

  const result = {
    ok: true,
    algorithm_version: ALGORITHM_VERSION,
    source,
    time_bases: {
      meihua_reference_time: meihuaMoment
        ? {
            input: meihuaMoment.input,
            timezone: meihuaMoment.timezone,
            wall_clock: meihuaMoment.wall_clock,
            utc: meihuaMoment.instant_iso,
          }
        : null,
      najia_cast_at: {
        input: najiaMoment.input,
        timezone: najiaMoment.timezone,
        wall_clock: najiaMoment.wall_clock,
        utc: najiaMoment.instant_iso,
        resolved_from: najiaMoment.resolved_from,
        dst_ambiguous: najiaMoment.dst_ambiguous,
        source_note: source.najia_time_source,
      },
      same_moment:
        meihuaMoment !== null && meihuaMoment.instant_iso === najiaMoment.instant_iso,
    },
    meihua: meihuaPayload,
    external,
    hexagram: {
      original_hexagram_id: hexagram.original_hexagram_id,
      original_hexagram_name: hexagram.original_hexagram_name,
      upper_trigram: hexagram.upper_trigram,
      lower_trigram: hexagram.lower_trigram,
      line_values_bottom_up: hexagram.line_values_bottom_up,
      moving_lines: hexagram.moving_lines,
      is_static: hexagram.is_static,
      changed_hexagram_id: hexagram.changed_hexagram_id,
      changed_hexagram_name: hexagram.changed_hexagram_name,
      changed_upper_trigram: hexagram.changed_upper_trigram ?? null,
      changed_lower_trigram: hexagram.changed_lower_trigram ?? null,
      order_convention: '爻值数组与二进制均为初爻→上爻（自下而上）；动爻位置 1=初爻 … 6=上爻',
    },
    najia_baseline: {
      solar: time.solarText,
      lunar: time.lunarText,
      ganzhi: time.ganzhiText,
      year_gz: time.yearGz,
      month_gz: time.monthGz,
      day_gz: time.dayGz,
      hour_gz: time.hourGz,
      month_branch: time.monthBranch,
      day_branch: time.dayGz.slice(-1),
      hour_branch: time.hourBranch,
      month_build_source: '节气月（纳甲口径；与梅花取数用的农历月无关）',
    },
    consistency,
    facts,
  };

  return result;
}

/* ------------------------------------------------------------------ */
/* 文本渲染                                                            */
/* ------------------------------------------------------------------ */

function renderSourceBlock(r) {
  const s = r.source;
  const tb = r.time_bases;
  const lines = [];
  lines.push('=== 卦源说明 ===');
  lines.push(`卦源类型：${s.source_method_label}`);
  lines.push(
    s.source_method === 'EXTERNAL_HEXAGRAM_INPUT'
      ? `外部取得方式：${s.acquisition_label}`
      : `取得方式：${s.acquisition_label}`,
  );
  lines.push(`输入模式：${s.input_mode_label}（${s.input_mode}）`);
  lines.push(`纳甲引擎：${s.najia_engine}`);
  lines.push(`断卦体系：${s.duangua_system}`);
  lines.push(`卦盘事实来源：${s.fact_source}`);
  lines.push(`算法版本：${r.algorithm_version}`);
  if (s.source_method !== 'EXTERNAL_HEXAGRAM_INPUT') {
    lines.push('说明：本卦由梅花方法生成卦画，装卦与断卦仍走纳甲六爻；不是铜钱摇卦。');
  } else {
    lines.push('说明：本卦由外部工具/方法取得，经代码标准化后装卦；不属于梅花起卦。');
  }
  lines.push('');
  lines.push('=== 纳甲排盘基准 ===');
  lines.push(`纳甲起卦时间：${tb.najia_cast_at.wall_clock}（${tb.najia_cast_at.timezone}，UTC ${tb.najia_cast_at.utc}）`);
  if (s.source_method === 'MEIHUA_TIME') {
    lines.push(`梅花取数时间：${tb.meihua_reference_time.wall_clock}（${tb.meihua_reference_time.timezone}）`);
    lines.push(
      tb.same_moment
        ? '双时间基准：取数与纳甲为同一时刻'
        : '双时间基准：梅花取数用事件时间，纳甲月日仍用实际占问时间（组合模式，不得隐瞒）',
    );
  } else if (s.source_method === 'MEIHUA_TWO_NUMBERS') {
    lines.push('梅花取数：不依赖时间（两数法），上面的时间仅用于纳甲装卦');
  } else {
    lines.push('梅花取数时间：无（外部卦象输入不做梅花取数，不伪造该字段）');
  }
  return lines.join('\n');
}

function renderMeihuaBlock(r) {
  if (!r.meihua) return '';
  const m = r.meihua;
  const out = ['=== 梅花取数 ==='];
  if (m.method === 'MEIHUA_TIME') {
    const c = m.calendar;
    const n = m.numbers;
    out.push(`农历：${c.lunar_text}（年支 ${c.year_zhi}${c.is_leap_month ? '，闰月按绝对值计' : ''}）`);
    out.push(`年支 ${c.year_zhi} = ${n.year_zhi_number}；农历月 = ${n.lunar_month}${c.is_leap_month ? '（闰月取绝对值）' : ''}；农历日 = ${n.lunar_day}；时支 ${c.hour_zhi} = ${n.hour_zhi_number}`);
    out.push(`S1 = ${n.year_zhi_number} + ${n.lunar_month} + ${n.lunar_day} = ${n.S1}`);
    out.push(`S2 = ${n.S1} + ${n.hour_zhi_number} = ${n.S2}`);
    out.push(`上卦 = ${n.S1} % 8 → ${n.upper_remainder} → ${m.hexagram.upper}`);
    out.push(`下卦 = ${n.S2} % 8 → ${n.lower_remainder} → ${m.hexagram.lower}`);
    out.push(`动爻 = ${n.S2} % 6 → ${n.moving_remainder} → ${POSITION_LABELS[n.moving_remainder - 1]}`);
    out.push(`（余数 0 时取 8 / 6；年支按农历正月初一换年，未使用立春换年与节气月；年支参考值 getYearZhiExact=${c.year_zhi_exact_reference_only} 仅备查不参与取数）`);
  } else {
    const n = m.numbers;
    out.push(`第一数 A = ${n.A} → 上卦 ${n.A} % 8 = ${n.upper_remainder} → ${m.hexagram.upper}`);
    out.push(`第二数 B = ${n.B} → 下卦 ${n.B} % 8 = ${n.lower_remainder} → ${m.hexagram.lower}`);
    out.push(`动爻 = (${n.A} + ${n.B}) % 6 = ${n.moving_remainder} → ${POSITION_LABELS[n.moving_remainder - 1]}`);
    out.push('（两数法为现代标准化口径：仅用两数，不加时辰、不换第三数；详见 references/source-notes.md）');
  }
  return out.join('\n');
}

function renderExternalBlock(r) {
  if (!r.external) return '';
  const e = r.external;
  const out = ['=== 外部卦象输入校验 ==='];
  out.push(`输入模式：${e.input_mode_label}（${e.input_mode}）`);
  out.push(`外部取得方式：${e.acquisition_label}（${e.acquisition_method}）`);
  if (e.supplied_line_values) out.push(`用户录入爻值（初→上）：${e.supplied_line_values.join(', ')}`);
  if (e.echo.original_hexagram) out.push(`用户录入本卦：${e.echo.original_hexagram}`);
  if (e.echo.changed_hexagram) out.push(`用户录入变卦：${e.echo.changed_hexagram}`);
  if (e.echo.moving_lines) out.push(`用户录入动爻：${e.echo.moving_lines.length ? e.echo.moving_lines.join(', ') : '（空）'}`);
  out.push(`机器推导爻值（初→上）：${e.line_values_bottom_up.join(', ')}`);
  out.push(`识别动爻：${e.moving_lines.length ? e.moving_lines.map((p) => POSITION_LABELS[p - 1]).join('、') : '无（静卦）'}`);
  out.push(`识别变卦：${e.changed_hexagram_name ?? '无（静卦不生成变卦）'}`);
  if (e.notes.length) out.push(`校验备注：${e.notes.join('；')}`);
  return out.join('\n');
}

function renderHexagramBlock(r) {
  const h = r.hexagram;
  const out = ['=== 卦象 ==='];
  out.push(`本卦：${h.original_hexagram_name}（${h.original_hexagram_id}，下${h.lower_trigram} 上${h.upper_trigram}）`);
  out.push(
    `动爻：${h.moving_lines.length ? h.moving_lines.map((p) => POSITION_LABELS[p - 1]).join('、') : '无（静卦）'}`,
  );
  out.push(
    `变卦：${h.is_static ? '无变卦（静卦，不得伪造本卦=变卦的假变卦）' : `${h.changed_hexagram_name}（${h.changed_hexagram_id}，下${h.changed_lower_trigram} 上${h.changed_upper_trigram}）`}`,
  );
  out.push(`爻值（初→上）：${h.line_values_bottom_up.join(', ')}　（7 少阳静／8 少阴静／9 老阳动／6 老阴动）`);
  return out.join('\n');
}

function renderChartTable(r) {
  const f = r.facts;
  const out = ['=== 六爻排盘（确定性引擎输出） ==='];
  for (let pos = 6; pos >= 1; pos -= 1) {
    const l = f.lines.find((x) => x.position === pos);
    const yin = l.isYang ? '阳' : '阴';
    const mark = l.isMoving ? '动' : '静';
    const role = l.isWorld ? '世' : l.isResponse ? '应' : '  ';
    const flags = [l.void ? '旬空' : '', l.monthBroken ? '月破' : '', ...l.stars].filter(Boolean).join('/');
    const changed = l.changed ? ` → ${l.changed.relation} ${l.changed.najia}` : '';
    const hidden = l.hidden ? `　伏:${l.hidden.relation}${l.hidden.najia}` : '';
    out.push(
      `${POSITION_LABELS[pos - 1]}　 ${l.sixGod} ${l.relation} ${l.najia} ${yin}${mark} ${role}${changed}${flags ? `　[${flags}]` : ''}${hidden}`,
    );
  }
  out.push('');
  out.push(`月建 ${r.najia_baseline.month_branch}　日辰 ${r.najia_baseline.day_gz}　旬空 ${f.voidBranches.join('')}　月卦身 ${f.monthBody.branch}（第 ${f.monthBody.position} 爻）`);
  out.push(`本卦：${f.base.name}（${f.base.palace}宫 ${f.base.element}${f.base.tags.length ? ' ' + f.base.tags.join('/') : ''}）`);
  out.push(
    `变卦：${f.changed ? `${f.changed.name}（${f.changed.palace}宫 ${f.changed.element}${f.changed.tags.length ? ' ' + f.changed.tags.join('/') : ''}）` : '无（静卦）'}`,
  );
  out.push(`神煞：贵人${f.shensha.guiren} 禄神${f.shensha.lushen} 羊刃${f.shensha.yangren} 文昌${f.shensha.wenchang} 驿马${f.shensha.yima} 桃花${f.shensha.taohua} 将星${f.shensha.jiangxing} 华盖${f.shensha.huagai} 谋星${f.shensha.mouxing} 劫煞${f.shensha.jiesha} 灾煞${f.shensha.zaisha} 天医${f.shensha.tianyi} 天喜${f.shensha.tianxi}`);
  out.push(`卦辞：${f.oracle.baseGuaCi ?? '（缺）'}`);
  if (f.oracle.changedGuaCi) out.push(`变卦卦辞：${f.oracle.changedGuaCi}`);
  for (const y of f.oracle.movingLines) out.push(`动爻辞（${POSITION_LABELS[y.position - 1]}）：${y.text}`);
  if (f.oracle.yong) out.push(`${f.oracle.yong.title}：${f.oracle.yong.text}`);
  return out.join('\n');
}

export function renderText(r) {
  const blocks = [
    renderSourceBlock(r),
    renderMeihuaBlock(r),
    renderExternalBlock(r),
    renderHexagramBlock(r),
    renderChartTable(r),
    '=== 事实包（JSON，权威字段） ===',
    JSON.stringify(r.facts, null, 2),
    '=== 下一步 ===',
    '把上面的「卦源说明」与「事实包」交给 references/duangua-prompt.md 走四段式断卦（取用／盘面／走势／应期，400–550 字）。',
    '不得由模型改动卦盘、动爻、变卦或纳甲字段；不得把梅花体用/生克混进纳甲用神体系。',
  ];
  return blocks.filter(Boolean).join('\n\n') + '\n';
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) fail(INVALID_INPUT, `参数 ${a} 缺少取值`);
      i += 1;
      return v;
    };
    switch (a) {
      case '--time':
        args.time = next();
        break;
      case '--tz':
      case '--timezone':
        args.tz = next();
        break;
      case '--time-source':
        args.timeSource = next();
        break;
      case '--numbers':
      case '--two-numbers':
        args.numbers = [next(), next()];
        break;
      case '--external':
        args.external = next();
        break;
      case '--question':
        args.question = next();
        break;
      case '--najia-cast-at':
      case '--najia-time':
        args.najiaCastAt = next();
        break;
      case '--najia-tz':
        args.najiaTz = next();
        break;
      case '--najia-time-source':
        args.najiaTimeSource = next();
        break;
      case '--now':
        args.now = true;
        break;
      case '--json':
        args.json = next();
        break;
      case '--file':
        args.file = next();
        break;
      case '--out':
        args.outer = next();
        break;
      case '--format':
        args.format = next();
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (a.startsWith('--')) fail(INVALID_INPUT, `未知参数：${a}（用 --help 查看用法）`);
        args._.push(a);
    }
  }
  return args;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    fail(INVALID_INPUT, '无法读取标准输入');
  }
}

function readTextFile(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    fail(INVALID_INPUT, `无法读取${label}：${path}（${e.code ?? e.message}）`);
  }
}

function parseJsonText(text, label) {
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(INVALID_INPUT, `${label} 不是合法 JSON：${e.message}`);
  }
}

export function inputFromArgs(args) {
  if (args.help) return null;

  // 0) 完全无参数：把 stdin 当作整份 JSON（便于管道：node scripts/cast.mjs < in.json）
  if (
    args.json === undefined &&
    args.file === undefined &&
    args.external === undefined &&
    args.time === undefined &&
    !args.numbers &&
    args._.length === 0 &&
    !args.now &&
    !args.question
  ) {
    args._.push('-');
  }

  // 1) 整份 JSON 输入（--json / --file / 位置参数 / stdin）
  let rawJson = null;
  if (args.json) rawJson = args.json;
  else if (args.file) rawJson = readTextFile(args.file, '输入文件');
  else if (args._.length && args._[0] !== '-') rawJson = readTextFile(args._[0], '输入文件');
  else if (args._.length && args._[0] === '-') rawJson = readStdin();

  if (rawJson !== null) {
    const parsed = parseJsonText(rawJson, '输入');
    if (args.question && !parsed.question) parsed.question = args.question;
    if (args.najiaCastAt) parsed.najia_cast_at = args.najiaCastAt;
    if (args.najiaTz) parsed.najia_timezone = args.najiaTz;
    if (args.najiaTimeSource) parsed.najia_time_source = args.najiaTimeSource;
    if (parsed.source_method) return parsed;
    // 允许只给 external 对象
    if (parsed.external || parsed.input_mode || parsed.six_line_values || parsed.original_hexagram) {
      return { source_method: 'EXTERNAL_HEXAGRAM_INPUT', external: parsed.external ?? parsed, question: parsed.question ?? '' };
    }
    if (parsed.two_numbers || parsed.numbers || parsed.a) {
      return {
        source_method: 'MEIHUA_TWO_NUMBERS',
        two_numbers: parsed.two_numbers ?? parsed.numbers ?? [parsed.a, parsed.b],
        najia_cast_at: parsed.najia_cast_at,
        najia_timezone: parsed.najia_timezone,
        question: parsed.question ?? '',
      };
    }
    if (parsed.meihua_reference_time || parsed.time) {
      return {
        source_method: 'MEIHUA_TIME',
        meihua_reference_time: parsed.meihua_reference_time ?? parsed.time,
        meihua_timezone: parsed.meihua_timezone ?? parsed.timezone,
        najia_cast_at: parsed.najia_cast_at,
        najia_timezone: parsed.najia_timezone,
        question: parsed.question ?? '',
      };
    }
    fail(INVALID_INPUT, 'JSON 里没有可识别的入口字段（source_method / external / two_numbers / meihua_reference_time）');
  }

  const base = { question: args.question ?? '' };

  // 2) 外部卦象：--external 文件、内联 JSON 或 stdin
  if (args.external !== undefined) {
    let externalObj;
    const v = args.external;
    if (v === '-' || v === 'stdin') externalObj = parseJsonText(readStdin(), 'stdin 外部卦象');
    else if (v.trim().startsWith('{')) externalObj = parseJsonText(v, '--external 内联 JSON');
    else externalObj = parseJsonText(readTextFile(v, '外部卦象文件'), `外部卦象文件 ${v}`);
    if (externalObj.external) externalObj = externalObj.external;
    return {
      ...base,
      source_method: 'EXTERNAL_HEXAGRAM_INPUT',
      external: externalObj,
      najia_cast_at: args.najiaCastAt ?? (args.now ? 'now' : undefined),
      najia_timezone: args.najiaTz ?? args.tz,
      najia_time_source: args.najiaTimeSource,
    };
  }

  // 3) 两数
  if (args.numbers) {
    return {
      ...base,
      source_method: 'MEIHUA_TWO_NUMBERS',
      two_numbers: args.numbers,
      najia_cast_at: args.najiaCastAt ?? (args.now ? 'now' : undefined),
      najia_timezone: args.najiaTz ?? args.tz,
      najia_time_source: args.najiaTimeSource,
    };
  }

  // 4) 时间法
  if (args.time !== undefined) {
    return {
      ...base,
      source_method: 'MEIHUA_TIME',
      meihua_reference_time: args.time,
      meihua_timezone: args.tz,
      meihua_time_source: args.timeSource,
      najia_cast_at: args.najiaCastAt,
      najia_timezone: args.najiaTz ?? args.tz,
      najia_time_source: args.najiaTimeSource,
    };
  }

  fail(INVALID_INPUT, '没有入口：用 --time / --numbers / --external 之一，或用 --file 传入整份 JSON（--help 看用法）');
  return null;
}

const HELP = `起卦入口与纳甲六爻断卦 CLI（qigua-najia-v1）

用法：
  node scripts/cast.mjs --time "2024-03-27 15:30" --tz Asia/Shanghai --question "..."
  node scripts/cast.mjs --numbers 5 3 --tz Asia/Shanghai --question "..."
  node scripts/cast.mjs --external input.json --najia-cast-at "2024-03-27 15:30" --najia-tz Asia/Shanghai
  node scripts/cast.mjs --file input.json      # 整份 JSON（见 references/engine-contract.md）
  node scripts/cast.mjs < input.json           # 从 stdin 读 JSON

参数：
  --time <str>            梅花时间法取数时间（YYYY-MM-DD HH:mm / ISO8601 / now）
  --tz <IANA>             时区，必填，不得省略（不用当前设备时区兜底）
  --numbers <A> <B>       梅花两数法（两个正整数）
  --external <path|JSON|-> 外部卦象输入（六爻爻值 / 本卦+变卦 / 本卦+动爻 / 本卦+静卦）
  --najia-cast-at <str>   纳甲排盘基准时间（外部与两数入口必填；也接受 now）
  --najia-tz <IANA>       纳甲时区（缺省沿用 --tz）
  --najia-time-source <s> 该时间的来源说明（现场自动记录/用户填写/第三方记录/来源不明）
  --time-source <s>       梅花取数时间来源说明（事件时间/原始发布时间…）
  --question <str>        求测事项
  --now                   显式声明用当前时刻（等价于把缺失的时间填 now）
  --out <path>            另存 JSON 结果
  --format <json|text>    输出格式（默认 text：卦源说明+排盘表+事实包 JSON）
  -h, --help              显示本帮助
`;

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(JSON.stringify(errorPayload(err), null, 2) + '\n');
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  let result;
  try {
    const input = inputFromArgs(args);
    result = runCast(input);
  } catch (err) {
    process.stderr.write(JSON.stringify(errorPayload(err), null, 2) + '\n');
    return 2;
  }
  if (args.outer) writeFileSync(args.outer, JSON.stringify(result, null, 2) + '\n', 'utf8');
  const format = (args.format ?? 'text').toLowerCase();
  process.stdout.write(format === 'json' ? JSON.stringify(result, null, 2) + '\n' : renderText(result));
  return 0;
}

const invokedDirectly = (() => {
  try {
    const entry = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
    return /(^|\/)cast\.mjs$/.test(entry);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = main();
}
