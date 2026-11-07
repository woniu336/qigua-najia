/**
 * 《古筮真诠》十三实用星煞计算体系 (Gu Shi Zhen Quan 13 Shensha System)
 * ====================================================================
 * 宗法规范：
 *   1. 天干四煞（以日干查）：
 *      - 贵人（天乙贵人）：甲戊并牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，庚辛逢虎马
 *      - 禄神：甲禄在寅，乙禄在卯，丙戊在巳，丁己在午，庚在申，辛在酉，壬在亥，癸在子
 *      - 羊刃（阳顺阴逆帝旺位）：甲卯 乙寅 丙午 丁巳 戊午 己巳 庚酉 辛申 壬子 癸亥
 *      - 文昌：甲巳 乙午 丙戊申 丁己酉 庚亥 辛子 壬寅 癸卯
 *   2. 地支七煞（以日支三合局查）：
 *      - 歌诀：“桃进马冲劫首生，将坐帐中与灾冲；谋星冲尾华盖同”
 *      - 三合局首中尾：申子辰（申-子-辰）、寅午戌（寅-午-戌）、巳酉丑（巳-酉-丑）、亥卯未（亥-卯-未）
 *      - 桃花（咸池）：首位进一位（申子辰酉，寅午戌卯，巳酉丑午，亥卯未子）
 *      - 驿马：冲首位（申子辰寅，寅午戌申，巳酉丑亥，亥卯未巳）
 *      - 劫煞：首位长生/尾位进一位（申子辰巳，寅午戌亥，巳酉丑寅，亥卯未申）
 *      - 将星：中位（申子辰子，寅午戌午，巳酉丑酉，亥卯未卯）
 *      - 灾煞：冲中位（申子辰午，寅午戌子，巳酉丑卯，亥卯未酉）
 *      - 谋星：冲尾位（申子辰戌，寅午戌辰，巳酉丑未，亥卯未丑）
 *      - 华盖：尾位同（申子辰辰，寅午戌戌，巳酉丑丑，亥卯未未）
 *   3. 季节与月令两煞：
 *      - 天医：“天医月上退一位”——正月丑，二月寅，三月卯，四月辰，五月巳，六月午，七月未，八月申，九月酉，十月戌，十一月亥，十二月子
 *      - 天喜：“天喜季土不相逢”——春戌（冲辰），夏丑（冲未），秋辰（冲戌），冬未（冲丑）
 */
// 1. 贵人 (天乙贵人，依日干)
const GUIREN_MAP = {
    甲: '丑、未', 戊: '丑、未',
    乙: '子、申', 己: '子、申',
    丙: '亥、酉', 丁: '亥、酉',
    壬: '卯、巳', 癸: '卯、巳',
    庚: '寅、午', 辛: '寅、午',
};
// 2. 禄神 (依日干)
const LUSHEN_MAP = {
    甲: '寅', 乙: '卯', 丙: '巳', 丁: '午',
    戊: '巳', 己: '午', 庚: '申', 辛: '酉',
    壬: '亥', 癸: '子',
};
// 3. 羊刃 (依日干，古筮真诠标准：阳顺阴逆帝旺位)
const YANGREN_MAP = {
    甲: '卯', 乙: '寅',
    丙: '午', 丁: '巳',
    戊: '午', 己: '巳',
    庚: '酉', 辛: '申',
    壬: '子', 癸: '亥',
};
// 4. 文昌 (依日干)
const WENCHANG_MAP = {
    甲: '巳', 乙: '午',
    丙: '申', 戊: '申',
    丁: '酉', 己: '酉',
    庚: '亥', 辛: '子',
    壬: '寅', 癸: '卯',
};
// 5. 驿马 (冲首位)
const YIMA_MAP = {
    申: '寅', 子: '寅', 辰: '寅',
    寅: '申', 午: '申', 戌: '申',
    巳: '亥', 酉: '亥', 丑: '亥',
    亥: '巳', 卯: '巳', 未: '巳',
};
// 6. 桃花 (首位进一位)
const TAOHUA_MAP = {
    申: '酉', 子: '酉', 辰: '酉',
    寅: '卯', 午: '卯', 戌: '卯',
    巳: '午', 酉: '午', 丑: '午',
    亥: '子', 卯: '子', 未: '子',
};
// 7. 将星 (中位同)
const JIANGXING_MAP = {
    申: '子', 子: '子', 辰: '子',
    寅: '午', 午: '午', 戌: '午',
    巳: '酉', 酉: '酉', 丑: '酉',
    亥: '卯', 卯: '卯', 未: '卯',
};
// 8. 劫煞 (首位长生，即尾位进一位)
const JIESHA_MAP = {
    申: '巳', 子: '巳', 辰: '巳',
    寅: '亥', 午: '亥', 戌: '亥',
    巳: '寅', 酉: '寅', 丑: '寅',
    亥: '申', 卯: '申', 未: '申',
};
// 9. 灾煞 (冲中位)
const ZAISHA_MAP = {
    申: '午', 子: '午', 辰: '午',
    寅: '子', 午: '子', 戌: '子',
    巳: '卯', 酉: '卯', 丑: '卯',
    亥: '酉', 卯: '酉', 未: '酉',
};
// 10. 华盖 (尾位同)
const HUAGAI_MAP = {
    申: '辰', 子: '辰', 辰: '辰',
    寅: '戌', 午: '戌', 戌: '戌',
    巳: '丑', 酉: '丑', 丑: '丑',
    亥: '未', 卯: '未', 未: '未',
};
// 11. 谋星 (冲尾位)
const MOUXING_MAP = {
    申: '戌', 子: '戌', 辰: '戌',
    寅: '辰', 午: '辰', 戌: '辰',
    巳: '未', 酉: '未', 丑: '未',
    亥: '丑', 卯: '丑', 未: '丑',
};
// 12. 天医 (月建退一位)
const TIANYI_MAP = {
    寅: '丑', 卯: '寅', 辰: '卯',
    巳: '辰', 午: '巳', 未: '午',
    申: '未', 酉: '申', 戌: '酉',
    亥: '戌', 子: '亥', 丑: '子',
};
// 13. 天喜 (季土不相逢：春戌 夏丑 秋辰 冬未)
const TIANXI_MAP = {
    寅: '戌', 卯: '戌', 辰: '戌',
    巳: '丑', 午: '丑', 未: '丑',
    申: '辰', 酉: '辰', 戌: '辰',
    亥: '未', 子: '未', 丑: '未',
};
const TIANGAN_SET = new Set(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']);
const DIZHI_SET = new Set(['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']);
/**
 * 计算《古筮真诠》十三实用星煞
 * @param dayGz 日柱干支（如 "丙辰"、"丙辰日"）
 * @param monthGzOrBranch 月令干支或月支（如 "丁未"、"未月"、"未"）
 */
export function calcGuShiShenSha(dayGz = '', monthGzOrBranch = '') {
    const cleanDay = dayGz.trim().replace(/日/g, '');
    let dayG = '';
    let dayB = '';
    for (const ch of cleanDay) {
        if (TIANGAN_SET.has(ch) && !dayG)
            dayG = ch;
        else if (DIZHI_SET.has(ch) && !dayB)
            dayB = ch;
    }
    const cleanMonth = monthGzOrBranch.trim().replace(/月/g, '');
    let monthB = '';
    for (const ch of cleanMonth) {
        if (DIZHI_SET.has(ch))
            monthB = ch;
    }
    // 兜底默认值
    dayG = dayG || '丙';
    dayB = dayB || '辰';
    monthB = monthB || '未';
    return {
        guiren: GUIREN_MAP[dayG] || '亥、酉',
        lushen: LUSHEN_MAP[dayG] || '巳',
        yangren: YANGREN_MAP[dayG] || '午',
        wenchang: WENCHANG_MAP[dayG] || '申',
        yima: YIMA_MAP[dayB] || '寅',
        taohua: TAOHUA_MAP[dayB] || '酉',
        jiangxing: JIANGXING_MAP[dayB] || '子',
        jiesha: JIESHA_MAP[dayB] || '巳',
        zaisha: ZAISHA_MAP[dayB] || '午',
        huagai: HUAGAI_MAP[dayB] || '辰',
        mouxing: MOUXING_MAP[dayB] || '戌',
        tianyi: TIANYI_MAP[monthB] || '午',
        tianxi: TIANXI_MAP[monthB] || '丑',
    };
}
export const SHENSHA_ORDER = [
    { key: 'guiren', label: '贵人' },
    { key: 'lushen', label: '禄神' },
    { key: 'yangren', label: '羊刃' },
    { key: 'wenchang', label: '文昌' },
    { key: 'yima', label: '驿马' },
    { key: 'taohua', label: '桃花' },
    { key: 'jiangxing', label: '将星' },
    { key: 'huagai', label: '华盖' },
    { key: 'mouxing', label: '谋星' },
    { key: 'jiesha', label: '劫煞' },
    { key: 'zaisha', label: '灾煞' },
    { key: 'tianyi', label: '天医' },
    { key: 'tianxi', label: '天喜' },
];
/**
 * 格式化神煞单行纯文本展示
 */
export function formatShenShaText(ss) {
    return SHENSHA_ORDER.map(({ key, label }) => {
        const val = ss[key];
        return val ? `${label}-${val}` : '';
    })
        .filter(Boolean)
        .join('  ');
}
/**
 * 宗法时空干支精简解析器
 * 规范：月建不写月干（如“未月”），日辰保留日干（如“丙辰日”），不写年柱与时柱
 */
export function extractLiuyaoTimeInfo(ganzhi = '', voidBranches = []) {
    const parts = (ganzhi || '').trim().split(/\s+/).filter(Boolean);
    let monthPart = parts.find((p) => p.includes('月')) || '';
    let dayPart = parts.find((p) => p.includes('日')) || '';
    if (!monthPart && !dayPart) {
        if (parts.length >= 4) {
            monthPart = parts[1];
            dayPart = parts[2];
        }
        else if (parts.length >= 2) {
            monthPart = parts[0];
            dayPart = parts[1];
        }
        else if (parts.length === 1) {
            monthPart = parts[0];
        }
    }
    else if (!monthPart && parts.length > 0) {
        monthPart = parts[0];
    }
    else if (!dayPart && parts.length > 1) {
        dayPart = parts.find((p) => p !== monthPart) || '';
    }
    let monthBranch = '';
    for (const ch of monthPart) {
        if (DIZHI_SET.has(ch)) {
            monthBranch = ch;
            break;
        }
    }
    if (!monthBranch) {
        for (const ch of ganzhi) {
            if (DIZHI_SET.has(ch)) {
                monthBranch = ch;
                break;
            }
        }
    }
    monthBranch = monthBranch || '未';
    const monthDisplay = `${monthBranch}月`;
    let dayStem = '';
    let dayBranch = '';
    for (const ch of dayPart) {
        if (TIANGAN_SET.has(ch) && !dayStem)
            dayStem = ch;
        else if (DIZHI_SET.has(ch) && !dayBranch)
            dayBranch = ch;
    }
    if (!dayStem || !dayBranch) {
        for (const ch of ganzhi) {
            if (TIANGAN_SET.has(ch) && !dayStem)
                dayStem = ch;
            else if (DIZHI_SET.has(ch) && ch !== monthBranch && !dayBranch)
                dayBranch = ch;
        }
    }
    dayStem = dayStem || '丙';
    dayBranch = dayBranch || '辰';
    const dayDisplay = `${dayStem}${dayBranch}日`;
    const voidStr = voidBranches && voidBranches.length > 0 ? voidBranches.join('') : '无';
    const compactGanzhi = `${monthDisplay} ${dayDisplay} (旬空 ${voidStr})`;
    return {
        monthBranch,
        monthDisplay,
        dayStem,
        dayBranch,
        dayDisplay,
        voidStr,
        compactGanzhi,
    };
}
