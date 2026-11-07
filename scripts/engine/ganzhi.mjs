/**
 * 起卦时刻 → 四柱干支（六爻排盘只需要节气月建与日柱、时支）。
 * 与 bazi-web `components/ZhanbuView.tsx::getGanzhiForDate` 同一取法：
 * 年/月/日取 Expo（节气/真太阳时无关的干支精确值），时取时辰干支。
 */
import { Lunar, Solar } from 'lunar-javascript';
const pad = (n) => String(n).padStart(2, '0');
/** datetime-local 字符串（YYYY-MM-DDTHH:mm）→ Date；非法时抛错，不静默兜底 */
export function parseTimeInput(value) {
    if (!value)
        throw new Error('起卦时间不能为空');
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        throw new Error(`起卦时间不合法：${value}`);
    return d;
}
export function nowTimeInput() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function castTimeInfo(date) {
    const lunar = Lunar.fromDate(date);
    const yearGz = lunar.getYearInGanZhiExact();
    const monthGz = lunar.getMonthInGanZhiExact();
    const dayGz = lunar.getDayInGanZhiExact();
    const hourGz = lunar.getTimeInGanZhi();
    const solarText = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const lunarText = `${lunar.getYearInChinese()}年 农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
    const ganzhiText = `${yearGz}年 ${monthGz}月 ${dayGz}日 ${hourGz}时`;
    return {
        iso: date.toISOString(),
        solarText,
        lunarText,
        ganzhiText,
        yearGz,
        monthGz,
        dayGz,
        hourGz,
        monthBranch: monthGz.slice(-1),
        hourBranch: hourGz.slice(-1),
    };
}
/** 由时间与投掷结果组装引擎入参 */
export function buildLiuyaoInput(time, coins) {
    return {
        yearGz: time.yearGz,
        monthBranch: time.monthBranch,
        dayGz: time.dayGz,
        hourBranch: time.hourBranch,
        coins,
    };
}
/** 顺手导出：阳历日期（供时间起卦预览时区一致性） */
export function solarOf(date) {
    return Solar.fromDate(date);
}

/* ------------------------------------------------------------------ */
/* 干支直输：用户直接给出月建/日辰（如「申月 丙子日」）时，不再需要公历时间   */
/* ------------------------------------------------------------------ */

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const ZODIAC = '鼠牛虎兔龙蛇马羊猴鸡狗猪';
const NAYIN_NAMES = [
  '海中金', '炉中火', '大林木', '路旁土', '剑锋金', '山头火', '涧下水', '城头土',
  '白蜡金', '杨柳木', '泉中水', '屋上土', '霹雳火', '松柏木', '长流水', '沙中金',
  '山下火', '平地木', '壁上土', '金箔金', '覆灯火', '天河水', '大驿土', '钗钏金',
  '桑柘木', '大溪水', '沙中土', '天上火', '石榴木', '大海水',
];

/** 只保留天干地支两字（允许「甲申月」「丙子日」「丙子」等写法） */
function cleanGz(raw, label) {
  const s = String(raw).replace(/[\s年月日时]/g, '');
  if (!/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(s)) {
    throw new Error(`${label} 必须是「天干+地支」两字，收到 "${raw}"`);
  }
  return s;
}

/** 只保留一个地支（允许「申」「申月」） */
function cleanBranch(raw, label) {
  const s = String(raw).replace(/[\s月时]/g, '');
  if (!/^[子丑寅卯辰巳午未申酉戌亥]$/.test(s)) {
    throw new Error(`${label} 必须是地支单字，收到 "${raw}"`);
  }
  return s;
}

/**
 * 由用户给定的干支组装 time 对象（形状与 castTimeInfo 一致）。
 * @param {{yearGz?:string, monthGz?:string, monthBranch?:string, dayGz:string, hourGz?:string, hourBranch?:string}} spec
 */
export function ganzhiTimeInfo(spec) {
  const dayGz = cleanGz(spec.dayGz, '日柱');
  let monthGz = '';
  let monthBranch = '';
  if (spec.monthGz) {
    monthGz = cleanGz(spec.monthGz, '月柱');
    monthBranch = monthGz.slice(-1);
  }
  if (spec.monthBranch) {
    const b = cleanBranch(spec.monthBranch, '月建');
    if (monthBranch && b !== monthBranch) {
      throw new Error(`月柱 "${spec.monthGz}" 与月建 "${spec.monthBranch}" 不一致`);
    }
    monthBranch = b;
    if (!monthGz) monthGz = `${b}月`;
  }
  if (!monthBranch) throw new Error('缺少月建（monthBranch 或 monthGz）');
  const yearGz = spec.yearGz ? cleanGz(spec.yearGz, '年柱') : '';
  const hourBranch = spec.hourGz
    ? cleanGz(spec.hourGz, '时柱').slice(-1)
    : spec.hourBranch
      ? cleanBranch(spec.hourBranch, '时支')
      : '';
  const hourGz = spec.hourGz ? cleanGz(spec.hourGz, '时柱') : hourBranch ? `${hourBranch}时` : '';

  const monthText = monthGz.endsWith('月') ? monthGz : `${monthGz}月`;
  const ganzhiText = [yearGz ? `${yearGz}年` : null, monthText, `${dayGz}日`, hourGz || null]
    .filter(Boolean)
    .join(' ');
  return {
    iso: null,
    solarText: '未提供（按用户给定干支直接排盘）',
    lunarText: '未提供',
    ganzhiText,
    yearGz,
    monthGz,
    dayGz,
    hourGz,
    monthBranch,
    hourBranch,
    time_source_kind: 'GANZHI_DIRECT',
  };
}
