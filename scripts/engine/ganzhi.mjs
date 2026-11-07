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
