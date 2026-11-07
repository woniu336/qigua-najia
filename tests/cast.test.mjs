/**
 * 回归测试：node --test tests/
 * ==========================
 * 覆盖设计稿 §8 全部必测项：观梅占时间法、两数 5+3、8 的倍数取坤、6 的倍数动上爻、
 * 静卦、单动爻、多动爻、本卦+变卦反推、本卦+动爻生成、缺动爻报错、冲突输入报错、
 * 动爻 1/6 方向、上下卦不颠倒，以及双时间字段、闰月、换年、子时等历法边界。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  castMeihuaTime,
  castMeihuaTwoNumbers,
  assembleMeihuaHexagram,
  meihuaTimeNumbers,
  remainderToEight,
  remainderToSix,
  lunarFields,
} from '../scripts/meihua.mjs';
import { normalizeExternal } from '../scripts/external.mjs';
import { runCast } from '../scripts/cast.mjs';
import { SIXTY_FOUR_HEXAGRAMS } from '../scripts/engine/najia.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const TZ = 'Asia/Shanghai';

function codeOf(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err.code ?? `UNEXPECTED:${err.name}:${err.message}`;
  }
}

function runExternal(externalObj, extra = {}) {
  return runCast({
    source_method: 'EXTERNAL_HEXAGRAM_INPUT',
    najia_cast_at: fx.external.najia_cast_at,
    najia_timezone: fx.external.najia_timezone,
    external: externalObj,
    ...extra,
  });
}

/* ------------------------------------------------------------------ */
/* 测试 A：观梅占（黄金样例）                                          */
/* ------------------------------------------------------------------ */

test('A1 观梅占取数：辰年十二月十七申时 → S1=34 S2=43', () => {
  const n = meihuaTimeNumbers({ yearZhiNumber: 5, lunarMonth: 12, lunarDay: 17, hourZhiNumber: 9 });
  assert.equal(n.S1, '34');
  assert.equal(n.S2, '43');
  assert.equal(n.upper_remainder, 2);
  assert.equal(n.lower_remainder, 3);
  assert.equal(n.moving_remainder, 1);
});

test('A2 观梅占卦象：泽火革初爻动 → 泽山咸', () => {
  const h = assembleMeihuaHexagram({ upperNumber: 2, lowerNumber: 3, movingPosition: 1 });
  assert.equal(h.upper, '兑');
  assert.equal(h.lower, '离');
  assert.equal(h.binary, '101110');
  assert.equal(h.name, '泽火革');
  assert.deepEqual(h.moving_lines, [1]);
  assert.equal(h.changed_binary, '001110');
  assert.equal(h.changed_name, '泽山咸');
  assert.deepEqual(h.line_values_bottom_up, [9, 8, 7, 7, 7, 8]);
});

test('A3 观梅占历法链：2025-01-16 15:30 Asia/Shanghai 确为 辰年腊月十七申时', () => {
  const r = castMeihuaTime(new Date(2025, 0, 16, 15, 30));
  assert.equal(r.calendar.year_zhi, '辰');
  assert.equal(r.calendar.lunar_month, 12);
  assert.equal(r.calendar.lunar_day, 17);
  assert.equal(r.calendar.hour_zhi, '申');
  assert.equal(r.numbers.S1, '34');
  assert.equal(r.numbers.S2, '43');
  assert.equal(r.hexagram.name, '泽火革');
  assert.equal(r.hexagram.changed_name, '泽山咸');
  assert.deepEqual(r.hexagram, { ...r.hexagram, ...fx.guanmei_time.hexagram });
});

test('A4 观梅占整链（CLI 核心 runCast）：事实包与卦象一致', () => {
  const r = runCast({
    source_method: 'MEIHUA_TIME',
    meihua_reference_time: '2025-01-16 15:30',
    meihua_timezone: TZ,
    question: '观梅占',
  });
  assert.equal(r.ok, true);
  assert.equal(r.algorithm_version, 'qigua-najia-v1');
  assert.equal(r.hexagram.original_hexagram_name, '泽火革');
  assert.equal(r.hexagram.changed_hexagram_name, '泽山咸');
  assert.deepEqual(r.hexagram.moving_lines, [1]);
  assert.equal(r.hexagram.lower_trigram, '离');
  assert.equal(r.hexagram.upper_trigram, '兑');
  assert.deepEqual(r.facts.movingLines, [1]);
  assert.equal(r.facts.base.name, '泽火革');
  assert.equal(r.facts.changed.name, '泽山咸');
});

/* ------------------------------------------------------------------ */
/* 测试 B：两数法                                                      */
/* ------------------------------------------------------------------ */

test('B1 两数 5+3：风火家人二爻动 → 风天小畜', () => {
  const r = castMeihuaTwoNumbers(5, 3);
  assert.deepEqual(
    {
      upper: r.hexagram.upper,
      lower: r.hexagram.lower,
      binary: r.hexagram.binary,
      name: r.hexagram.name,
      moving: r.hexagram.moving_lines,
      changed: r.hexagram.changed_name,
    },
    {
      upper: '巽',
      lower: '离',
      binary: '101011',
      name: '风火家人',
      moving: [2],
      changed: '风天小畜',
    },
  );
  assert.deepEqual(r.hexagram.line_values_bottom_up, fx.two_numbers_5_3.expected.line_values_bottom_up);
});

test('B2 两数法只用两个数：不叠加时辰（同一对数字结果恒定）', () => {
  const a = castMeihuaTwoNumbers(5, 3);
  const b = castMeihuaTwoNumbers('5', '3');
  assert.deepEqual(a.hexagram, b.hexagram);
  // 动爻只由 (A+B) 决定；若误加时辰，43 % 6 = 1 会变成别的位置
  assert.equal(a.numbers.moving_remainder, 2);
});

test('B3 两数法整数精确运算：大数 / BigInt 不丢精度', () => {
  const big = 100000000000000000000n; // 1e20，超出安全整数范围
  const r = castMeihuaTwoNumbers(big, 3n);
  assert.equal(r.numbers.A, '100000000000000000000');
  assert.equal(remainderToEight(big), Number(((big % 8n) + 8n) % 8n) || 8);
  assert.equal(remainderToSix(big + 3n), Number((((big + 3n) % 6n) + 6n) % 6n) || 6);
});

test('B4 两数法拒绝非正整数', () => {
  for (const bad of [-1, 0, 3.5, '3.5', 'abc', '', null, undefined, NaN, {}]) {
    if (bad === 5) continue;
    const code = codeOf(() => castMeihuaTwoNumbers(bad, 3));
    assert.equal(code, 'INVALID_INPUT', `期望 ${JSON.stringify(bad)} 被拒绝，实得 ${code}`);
  }
  assert.equal(codeOf(() => castMeihuaTwoNumbers(5, -2)), 'INVALID_INPUT');
});

/* ------------------------------------------------------------------ */
/* 余数边界：8 的倍数取坤、6 的倍数动上爻                               */
/* ------------------------------------------------------------------ */

test('C1 8 的倍数取坤（余 0 → 8）', () => {
  assert.equal(remainderToEight(8), 8);
  assert.equal(remainderToEight(16), 8);
  assert.equal(remainderToEight(24), 8);
  assert.equal(remainderToEight(0), 8);
  const r = castMeihuaTwoNumbers(8, 8);
  assert.equal(r.hexagram.upper, '坤');
  assert.equal(r.hexagram.lower, '坤');
  assert.equal(r.hexagram.name, '坤为地');
  assert.deepEqual(r.hexagram.moving_lines, [4]);
  assert.equal(r.hexagram.changed_name, '雷地豫');
});

test('C2 6 的倍数动上爻（余 0 → 6，不是初爻）', () => {
  assert.equal(remainderToSix(6), 6);
  assert.equal(remainderToSix(12), 6);
  assert.equal(remainderToSix(0), 6);
  const r = castMeihuaTwoNumbers(6, 6);
  assert.equal(r.hexagram.name, '坎为水');
  assert.deepEqual(r.hexagram.moving_lines, [6], '动爻 6 = 上爻（数组索引 5），不得反转为初爻');
  assert.equal(r.hexagram.changed_name, '风水涣');
  assert.equal(r.hexagram.line_values_bottom_up[5], 6, '上爻为阴动 → 6（老阴）');
  assert.equal(r.hexagram.line_values_bottom_up[0], 8, '初爻为少阴静 → 8');
});

/* ------------------------------------------------------------------ */
/* 动爻方向：1 与 6 不得反转                                           */
/* ------------------------------------------------------------------ */

test('C3 动爻 1 与动爻 6 方向不反转', () => {
  const one = normalizeExternal({ input_mode: 'ORIGINAL_PLUS_MOVING_LINES', original_hexagram: '乾为天', moving_lines: [1] });
  const six = normalizeExternal({ input_mode: 'ORIGINAL_PLUS_MOVING_LINES', original_hexagram: '乾为天', moving_lines: [6] });
  assert.equal(one.changed_hexagram_name, '天风姤', '初爻动 → 翻转二进制第 1 位（最低位）');
  assert.equal(six.changed_hexagram_name, '泽天夬', '上爻动 → 翻转二进制第 6 位');
  assert.equal(one.changed_hexagram_id, '011111');
  assert.equal(six.changed_hexagram_id, '111110');
  assert.deepEqual(one.line_values_bottom_up, [9, 7, 7, 7, 7, 7]);
  assert.deepEqual(six.line_values_bottom_up, [7, 7, 7, 7, 7, 9]);
});

/* ------------------------------------------------------------------ */
/* 上下卦不颠倒                                                        */
/* ------------------------------------------------------------------ */

test('C4 上下卦不颠倒：binary = 下卦(内) + 上卦(外)', () => {
  const r = castMeihuaTwoNumbers(5, 3); // 上巽 下离
  assert.equal(r.hexagram.lower, '离');
  assert.equal(r.hexagram.upper, '巽');
  assert.equal(r.hexagram.binary.slice(0, 3), '101', '前三位必须是下卦（内卦）离');
  assert.equal(r.hexagram.binary.slice(3), '011', '后三位必须是上卦（外卦）巽');
  assert.equal(SIXTY_FOUR_HEXAGRAMS[r.hexagram.binary].name, '风火家人');

  const cast = runCast({
    source_method: 'MEIHUA_TWO_NUMBERS',
    two_numbers: [5, 3],
    najia_cast_at: '2025-01-16 15:30',
    najia_timezone: TZ,
  });
  assert.equal(cast.hexagram.upper_trigram, '巽');
  assert.equal(cast.hexagram.lower_trigram, '离');
});

/* ------------------------------------------------------------------ */
/* 外部输入：静卦 / 单动爻 / 多动爻                                     */
/* ------------------------------------------------------------------ */

test('D1 静卦 [7,8,7,8,7,8]：无动爻、无变卦、不伪造假变卦', () => {
  const r = runExternal(fx.external.static);
  assert.equal(r.hexagram.original_hexagram_name, '水火既济');
  assert.deepEqual(r.hexagram.moving_lines, []);
  assert.equal(r.hexagram.is_static, true);
  assert.equal(r.hexagram.changed_hexagram_id, null);
  assert.equal(r.hexagram.changed_hexagram_name, null);
  assert.equal(r.facts.changed, null);
  assert.equal(r.facts.oracle.changedGuaCi, null);
  assert.equal(r.consistency.engine_matches_computation, true);
});

test('D2 单动爻 [7,7,9,7,7,7]：乾为天三爻动 → 天泽履', () => {
  const r = runExternal(fx.external.single_moving);
  assert.equal(r.hexagram.original_hexagram_name, '乾为天');
  assert.deepEqual(r.hexagram.moving_lines, [3]);
  assert.equal(r.hexagram.changed_hexagram_name, '天泽履');
});

test('D3 多动爻 [6,7,9,7,8,9]：三条动爻全部保留，不压成一条', () => {
  const r = runExternal(fx.external.multi_moving);
  assert.equal(r.hexagram.original_hexagram_name, '火风鼎');
  assert.deepEqual(r.hexagram.moving_lines, [1, 3, 6]);
  assert.equal(r.hexagram.changed_hexagram_name, '雷泽归妹');
  assert.deepEqual(r.facts.movingLines, [1, 3, 6]);
  assert.equal(r.facts.lines.filter((l) => l.isMoving).length, 3);
  // 变爻必须逐爻给出，且只有动爻有
  assert.deepEqual(
    r.facts.lines.filter((l) => l.changed).map((l) => l.position),
    [1, 3, 6],
  );
});

test('D4 六爻全动 [6,6,6,6,6,6]：静坤变纯乾（引擎支持 0–6 条动爻）', () => {
  const r = runExternal({ input_mode: 'SIX_LINE_VALUES', six_line_values: [6, 6, 6, 6, 6, 6] });
  assert.equal(r.hexagram.original_hexagram_name, '坤为地');
  assert.deepEqual(r.hexagram.moving_lines, [1, 2, 3, 4, 5, 6]);
  assert.equal(r.hexagram.changed_hexagram_name, '乾为天');
  assert.equal(r.facts.oracle.yong !== null, true, '六爻全动且为坤 → 应带用六');
});

test('D5 本卦+变卦反推动爻', () => {
  const r = runExternal(fx.external.original_plus_changed);
  assert.equal(r.external.input_mode, 'ORIGINAL_PLUS_CHANGED');
  assert.deepEqual(r.external.moving_lines, [1]);
  assert.deepEqual(r.external.line_values_bottom_up, [9, 8, 7, 7, 7, 8]);
  assert.equal(r.hexagram.changed_hexagram_name, '泽山咸');
});

test('D6 本卦+动爻生成变卦（不手填变卦）', () => {
  const r = runExternal(fx.external.original_plus_moving);
  assert.equal(r.hexagram.original_hexagram_name, '风火家人');
  assert.equal(r.hexagram.changed_hexagram_name, '风天小畜');
  assert.deepEqual(r.external.line_values_bottom_up, [7, 6, 7, 8, 7, 7]);
});

test('D7 本卦+相同变卦：识别为静卦（不是有变爻的假变卦）', () => {
  const r = runExternal({ input_mode: 'ORIGINAL_PLUS_CHANGED', original_hexagram: '泽火革', changed_hexagram: '泽火革' });
  assert.deepEqual(r.external.moving_lines, []);
  assert.equal(r.hexagram.is_static, true);
  assert.equal(r.hexagram.changed_hexagram_id, null);
});

/* ------------------------------------------------------------------ */
/* 失败关闭：缺信息 / 冲突                                             */
/* ------------------------------------------------------------------ */

test('E1 只给本卦、无动爻无变卦、无静卦声明 → MISSING_CHANGE_INFORMATION', () => {
  assert.equal(codeOf(() => runExternal({ original_hexagram: '泽火革' })), 'MISSING_CHANGE_INFORMATION');
  assert.equal(
    codeOf(() => runExternal({ input_mode: 'ORIGINAL_PLUS_MOVING_LINES', original_hexagram: '泽火革', moving_lines: [] })),
    'MISSING_CHANGE_INFORMATION',
    'moving_lines 为空但没有静卦声明，也不得默认静卦',
  );
  // 必须真的报错退出，不得返回一份「大概能用」的盘
  assert.throws(() => runExternal({ original_hexagram: '泽火革' }), /MISSING_CHANGE_INFORMATION/);
});

test('E2 冲突输入 → CONFLICTING_HEXAGRAM_INPUT', () => {
  // (a) 爻值与卦名互相矛盾
  assert.equal(
    codeOf(() => runExternal({ input_mode: 'SIX_LINE_VALUES', six_line_values: [7, 7, 7, 7, 7, 7], original_hexagram: '坤为地' })),
    'CONFLICTING_HEXAGRAM_INPUT',
  );
  // (b) 本卦=变卦 却声明有动爻
  assert.equal(
    codeOf(() => runExternal({ input_mode: 'ORIGINAL_PLUS_CHANGED', original_hexagram: '泽火革', changed_hexagram: '泽火革', moving_lines: [1] })),
    'CONFLICTING_HEXAGRAM_INPUT',
  );
  // (c) 本卦+变卦 推得的动爻与声明的动爻不一致
  assert.equal(
    codeOf(() => runExternal({ input_mode: 'ORIGINAL_PLUS_CHANGED', original_hexagram: '泽火革', changed_hexagram: '泽山咸', moving_lines: [2] })),
    'CONFLICTING_HEXAGRAM_INPUT',
  );
  // (d) 声明静卦却有动爻
  assert.equal(
    codeOf(() => runExternal({ input_mode: 'ORIGINAL_STATIC', original_hexagram: '泽火革', is_static: true, moving_lines: [3] })),
    'CONFLICTING_HEXAGRAM_INPUT',
  );
  // (e) 爻值与用户额外给出的变卦名不一致
  assert.equal(
    codeOf(() => runExternal({ input_mode: 'SIX_LINE_VALUES', six_line_values: [7, 8, 7, 8, 7, 8], changed_hexagram: '乾为天' })),
    'CONFLICTING_HEXAGRAM_INPUT',
  );
});

test('E3 非法输入 → INVALID_INPUT（未知卦名 / 非法爻值 / 非法动爻）', () => {
  assert.equal(codeOf(() => normalizeExternal({ input_mode: 'ORIGINAL_STATIC', original_hexagram: '泽火戈', is_static: true })), 'INVALID_INPUT');
  assert.equal(codeOf(() => normalizeExternal({ input_mode: 'SIX_LINE_VALUES', six_line_values: [7, 8, 5, 8, 7, 8] })), 'INVALID_INPUT');
  assert.equal(codeOf(() => normalizeExternal({ input_mode: 'ORIGINAL_PLUS_MOVING_LINES', original_hexagram: '泽火革', moving_lines: [0] })), 'INVALID_INPUT');
  assert.equal(codeOf(() => normalizeExternal({ input_mode: 'ORIGINAL_PLUS_MOVING_LINES', original_hexagram: '泽火革', moving_lines: [1, 1] })), 'INVALID_INPUT');
});

test('E4 外部输入不得伪造梅花取数时间', () => {
  assert.equal(
    codeOf(() =>
      runCast({
        source_method: 'EXTERNAL_HEXAGRAM_INPUT',
        meihua_reference_time: '2025-01-16 15:30',
        meihua_timezone: TZ,
        najia_cast_at: '2025-01-16 15:30',
        najia_timezone: TZ,
        external: fx.external.static,
      }),
    ),
    'INVALID_INPUT',
  );
  const ok = runExternal(fx.external.static);
  assert.equal(ok.time_bases.meihua_reference_time, null);
  assert.equal(ok.source.source_method, 'EXTERNAL_HEXAGRAM_INPUT');
  assert.notEqual(ok.source.acquisition_method, 'MEIHUA_COMPUTED');
});

/* ------------------------------------------------------------------ */
/* 双时间字段 / 历法口径                                               */
/* ------------------------------------------------------------------ */

test('F1 双时间基准：事件时间取梅花数、占问时间安纳甲', () => {
  const r = runCast({
    source_method: 'MEIHUA_TIME',
    meihua_reference_time: '2025-01-16 15:30',
    meihua_timezone: TZ,
    najia_cast_at: '2025-02-10 09:10',
    najia_timezone: TZ,
    meihua_time_source: '事件发生时间',
    najia_time_source: '用户现场提交',
  });
  assert.equal(r.time_bases.same_moment, false);
  assert.equal(r.time_bases.meihua_reference_time.wall_clock, '2025-01-16 15:30:00');
  assert.equal(r.time_bases.najia_cast_at.wall_clock, '2025-02-10 09:10:00');
  assert.equal(r.hexagram.original_hexagram_name, '泽火革', '梅花取数必须用事件时间');
  assert.equal(r.facts.time.ganzhi.includes('甲辰年'), false, '纳甲月日必须用占问时间（2025-02-10 已换年）');
});

test('F2 年支按农历正月初一换年（不按立春）', () => {
  const before = lunarFields(new Date(2024, 1, 9, 12, 0)); // 2024-02-09 除夕，立春已过
  const after = lunarFields(new Date(2024, 1, 10, 12, 0)); // 2024-02-10 正月初一
  assert.equal(before.year_zhi, '卯', '农历年支：除夕仍属卯年');
  assert.equal(before.year_zhi_number, 4);
  assert.equal(after.year_zhi, '辰');
  assert.equal(after.year_zhi_number, 5);
  assert.equal(before.year_zhi_exact_reference_only, '辰', 'getYearZhiExact 已是辰，但只备查、不参与取数');
});

test('F3 闰月取绝对值并记录口径', () => {
  const f = lunarFields(new Date(2023, 2, 22, 12, 0)); // 2023-03-22 = 农历闰二月初一
  assert.equal(f.is_leap_month, true);
  assert.equal(f.lunar_month, 2);
  assert.equal(f.lunar_month_raw, -2);
  assert.equal(f.lunar_day, 1);
});

test('F4 子时与换日：23:30 属子时，但农历日仍按当日民用日期', () => {
  const late = lunarFields(new Date(2024, 1, 10, 23, 30));
  const noon = lunarFields(new Date(2024, 1, 10, 12, 0));
  assert.equal(late.hour_zhi, '子');
  assert.equal(late.hour_zhi_number, 1);
  assert.equal(late.lunar_day, noon.lunar_day, '23:00–23:59 的农历日不得跳到次日');
  assert.equal(late.lunar_month, noon.lunar_month);
});

test('F5 缺时区或缺时间 → 失败关闭，不用设备时区兜底', () => {
  assert.equal(
    codeOf(() => runCast({ source_method: 'MEIHUA_TIME', meihua_reference_time: '2025-01-16 15:30' })),
    'INVALID_INPUT',
  );
  assert.equal(
    codeOf(() =>
      runCast({ source_method: 'EXTERNAL_HEXAGRAM_INPUT', external: fx.external.static, najia_cast_at: '2025-01-16 15:30' }),
    ),
    'INVALID_INPUT',
  );
  assert.equal(codeOf(() => runCast({ source_method: 'MEIHUA_TWO_NUMBERS', two_numbers: [5, 3], najia_timezone: TZ })), 'INVALID_INPUT');
  assert.equal(
    codeOf(() =>
      runCast({ source_method: 'MEIHUA_TIME', meihua_reference_time: '2025-01-16 15:30', meihua_timezone: 'Mars/Olympus' }),
    ),
    'INVALID_INPUT',
  );
});

/* ------------------------------------------------------------------ */
/* 事实包完整性（与本仓库引擎一致）                                     */
/* ------------------------------------------------------------------ */

test('G1 事实包字段齐全：纳甲/六亲/六神/世应/动变/伏神/旬空/月建/日辰/神煞/卦爻辞', () => {
  const r = runCast({
    source_method: 'MEIHUA_TIME',
    meihua_reference_time: '2025-01-16 15:30',
    meihua_timezone: TZ,
  });
  const f = r.facts;

  assert.equal(f.kind, 'liuyao');
  assert.ok(f.time.ganzhi.includes('年'));
  assert.equal(f.lines.length, 6);

  for (const line of f.lines) {
    assert.ok(line.najia && line.relation && line.sixGod, `第 ${line.position} 爻缺纳甲/六亲/六神`);
    assert.equal(typeof line.isYang, 'boolean');
    assert.equal(typeof line.isMoving, 'boolean');
    assert.ok(['兄弟', '妻财', '子孙', '官鬼', '父母'].includes(line.relation));
    assert.ok(['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'].includes(line.sixGod));
  }

  // 世应各一
  assert.equal(f.lines.filter((l) => l.isWorld).length, 1);
  assert.equal(f.lines.filter((l) => l.isResponse).length, 1);

  // 动变
  assert.deepEqual(f.lines.filter((l) => l.changed).map((l) => l.position), f.movingLines);
  assert.ok(f.changed && f.changed.name === '泽山咸');

  // 伏神（泽火革缺妻财 → 三爻借本宫首卦）
  const hidden = f.lines.filter((l) => l.hidden);
  assert.ok(hidden.length >= 1, '应至少有一个伏神');
  assert.equal(hidden[0].hidden.relation, '妻财');

  // 旬空 / 月卦身 / 神煞 13 项
  assert.equal(f.voidBranches.length, 2);
  assert.ok(f.monthBody.branch && f.monthBody.position >= 1);
  assert.equal(Object.keys(f.shensha).length, 13);

  // 卦爻辞
  assert.ok(f.oracle.baseGuaCi);
  assert.ok(f.oracle.changedGuaCi);
  assert.equal(f.oracle.movingLines[0].position, 1);
  assert.ok(f.oracle.movingLines[0].text.startsWith('初九'));

  // 纳甲基准
  assert.equal(r.najia_baseline.month_branch, '丑');
  assert.equal(r.najia_baseline.day_gz, '乙酉');
  assert.equal(r.consistency.engine_matches_computation, true);
});

test('G2 结论可复现：同输入两次运行完全一致', () => {
  const input = {
    source_method: 'MEIHUA_TWO_NUMBERS',
    two_numbers: [5, 3],
    najia_cast_at: '2025-01-16 15:30',
    najia_timezone: TZ,
  };
  assert.deepEqual(runCast(input), runCast(input));
});

/* ------------------------------------------------------------------ */
/* CLI 冒烟测试（三种入口都能直接跑）                                   */
/* ------------------------------------------------------------------ */

const SCRIPT = fileURLToPath(new URL('../scripts/cast.mjs', import.meta.url));
const SKILL_ROOT = fileURLToPath(new URL('..', import.meta.url));

function cli(args, input) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: SKILL_ROOT,
    encoding: 'utf8',
    input,
  });
}

test('H1 CLI 时间入口', () => {
  const res = cli(['--time', '2025-01-16 15:30', '--tz', TZ, '--question', '冒烟']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /卦源说明/);
  assert.match(res.stdout, /泽火革/);
  assert.match(res.stdout, /泽山咸/);
  assert.match(res.stdout, /事实包/);
});

test('H2 CLI 两数入口', () => {
  const res = cli(['--numbers', '5', '3', '--tz', TZ, '--now']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /梅花两数报数起卦/);
  assert.match(res.stdout, /风火家人/);
  assert.match(res.stdout, /风天小畜/);
});

test('H3 CLI 外部入口（stdin JSON）', () => {
  const payload = JSON.stringify({
    source_method: 'EXTERNAL_HEXAGRAM_INPUT',
    najia_cast_at: '2025-01-16 15:30',
    najia_timezone: TZ,
    external: { input_mode: 'SIX_LINE_VALUES', acquisition_method: 'COIN_TOSS', six_line_values: [7, 8, 7, 8, 7, 8] },
  });
  const res = cli([], payload);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /外部卦象输入/);
  assert.match(res.stdout, /铜钱手摇/);
  assert.match(res.stdout, /水火既济/);
  assert.match(res.stdout, /无（静卦）/);
});

test('H4 CLI 失败关闭：退出码 2 + 错误码', () => {
  const res = cli(['--external', '{"original_hexagram":"泽火革"}', '--najia-cast-at', '2025-01-16 15:30', '--najia-tz', TZ]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /MISSING_CHANGE_INFORMATION/);
  assert.match(res.stderr, /fail_closed/);
});

/* ================================================================== */
/* 干支直输（najia_ganzhi）：用户只给「申月 丙子日」也能直接排盘         */
/* ================================================================== */

const MINGYI = { input_mode: 'ORIGINAL_PLUS_CHANGED', original_hexagram: '地火明夷', changed_hexagram: '雷山小过' };

test('G1 干支直输与公历时间排出的盘完全一致（月建/日辰/旬空/六神）', () => {
  const byGanzhi = runCast({
    source_method: 'EXTERNAL_HEXAGRAM_INPUT',
    external: MINGYI,
    najia_ganzhi: '申月 丙子日',
    question: '占出行',
  });
  const byClock = runCast({
    source_method: 'EXTERNAL_HEXAGRAM_INPUT',
    external: MINGYI,
    najia_cast_at: '2025-09-04 15:30',
    najia_timezone: TZ,
    question: '占出行',
  });
  assert.equal(byGanzhi.najia_baseline.time_source_kind, 'GANZHI_DIRECT');
  assert.equal(byClock.najia_baseline.time_source_kind, 'WALL_CLOCK');
  assert.equal(byGanzhi.najia_baseline.month_branch, byClock.najia_baseline.month_branch);
  assert.equal(byGanzhi.najia_baseline.day_gz, byClock.najia_baseline.day_gz);
  assert.equal(byGanzhi.facts.voidBranches.join(''), byClock.facts.voidBranches.join(''));
  assert.deepEqual(
    byGanzhi.facts.lines.map((l) => `${l.position}${l.sixGod}${l.relation}${l.najia}`),
    byClock.facts.lines.map((l) => `${l.position}${l.sixGod}${l.relation}${l.najia}`),
  );
  assert.equal(byGanzhi.najia_baseline.month_branch, '申');
  assert.equal(byGanzhi.najia_baseline.day_gz, '丙子');
  assert.equal(byGanzhi.facts.voidBranches.join(''), '申酉');
  assert.equal(byGanzhi.hexagram.original_hexagram_name, '地火明夷');
  assert.equal(byGanzhi.hexagram.changed_hexagram_name, '雷山小过');
});

test('G2 干支直输：分项写法 / 月柱写法 / 带年柱', () => {
  const a = runCast({
    source_method: 'EXTERNAL_HEXAGRAM_INPUT',
    external: MINGYI,
    najia_month_branch: '申',
    najia_day_gz: '丙子',
  });
  const b = runCast({
    source_method: 'EXTERNAL_HEXAGRAM_INPUT',
    external: MINGYI,
    najia_ganzhi: '乙巳年 甲申月 丙子日',
  });
  assert.equal(a.najia_baseline.month_branch, '申');
  assert.equal(b.najia_baseline.month_branch, '申');
  assert.equal(b.najia_baseline.year_gz, '乙巳');
  assert.equal(b.najia_baseline.time_source_kind, 'GANZHI_DIRECT');
  assert.match(b.facts.time.ganzhi, /乙巳年 甲申月 丙子日/);
});

test('G3 干支与公历时间矛盾 → INVALID_INPUT，不替用户择一', () => {
  assert.throws(
    () =>
      runCast({
        source_method: 'EXTERNAL_HEXAGRAM_INPUT',
        external: MINGYI,
        najia_ganzhi: '申月 丙子日',
        najia_cast_at: '2025-01-16 15:30', // 丁丑月
        najia_timezone: TZ,
      }),
    /INVALID_INPUT[\s\S]*不一致|不一致[\s\S]*INVALID_INPUT/,
  );
});

test('G4 干支直输缺月建 / 格式错 → INVALID_INPUT', () => {
  assert.throws(
    () => runCast({ source_method: 'EXTERNAL_HEXAGRAM_INPUT', external: MINGYI, najia_ganzhi: '丙子日' }),
    /缺少月建/,
  );
  assert.throws(
    () => runCast({ source_method: 'EXTERNAL_HEXAGRAM_INPUT', external: MINGYI, najia_ganzhi: '申月 丙X日' }),
    /缺少日柱|不合法/,
  );
});

test('G5 梅花时间法不得改用干支直输（梅花取数需要农历年月日）', () => {
  assert.throws(
    () =>
      runCast({
        source_method: 'MEIHUA_TIME',
        meihua_reference_time: '2025-01-16 15:30',
        meihua_timezone: TZ,
        najia_ganzhi: '申月 丙子日',
      }),
    /梅花时间法必须用公历时间取数/,
  );
});

test('G6 CLI：--external + --najia-ganzhi，无需公历日期', () => {
  const res = cli([
    '--external',
    JSON.stringify(MINGYI),
    '--najia-ganzhi',
    '申月 丙子日',
    '--question',
    '占出行',
  ]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /干支直输 申月 丙子日/);
  assert.match(res.stdout, /月建 申/);
  assert.match(res.stdout, /日辰 丙子/);
  assert.match(res.stdout, /旬空 申酉/);
});
