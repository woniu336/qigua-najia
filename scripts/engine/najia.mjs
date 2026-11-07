/**
 * 六爻确定性排盘引擎（纯物理层）
 * ================================
 * 从 bazi-web `src/engine/core.py::HexagramEngine` 逐条移植，只做**确定性排盘**：
 *   三钱投掷 → 本卦/变卦 → 纳甲装卦 → 安世应 → 定六亲 → 旬空 → 六神 → 伏神 → 月卦身 → 神煞。
 *
 * 刻意不包含：意图识别、用神选取、生克旺衰打分、应期、五层 DAG、任何大模型调用。
 *
 * 宗法依据：《卜筮正宗》第二篇飞伏神定例、第十八问答装卦规则；
 * 神煞只取可硬编码的四柱神煞（驿马/桃花/禄神/贵人/天医/文昌），不加任何解断。
 */
export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
/** 八卦基本属性：binary 为初爻→上爻（1 阳 0 阴） */
export const TRIGRAMS = {
    乾: { element: '金', binary: '111', nature: '老父' },
    兑: { element: '金', binary: '110', nature: '少女' },
    离: { element: '火', binary: '101', nature: '中女' },
    震: { element: '木', binary: '100', nature: '长男' },
    巽: { element: '木', binary: '011', nature: '长女' },
    坎: { element: '水', binary: '010', nature: '中男' },
    艮: { element: '土', binary: '001', nature: '少男' },
    坤: { element: '土', binary: '000', nature: '老母' },
};
/** 纳甲装卦：宫名 → 内卦（初二三）/ 外卦（四五六）干支五行 */
export const NAJIA_RULES = {
    乾: { inner: ['甲子水', '甲寅木', '甲辰土'], outer: ['壬午火', '壬申金', '壬戌土'] },
    坎: { inner: ['戊寅木', '戊辰土', '戊午火'], outer: ['戊申金', '戊戌土', '戊子水'] },
    艮: { inner: ['丙辰土', '丙午火', '丙申金'], outer: ['丙戌土', '丙子水', '丙寅木'] },
    震: { inner: ['庚子水', '庚寅木', '庚辰土'], outer: ['庚午火', '庚申金', '庚戌土'] },
    巽: { inner: ['辛丑土', '辛亥水', '辛酉金'], outer: ['辛未土', '辛巳火', '辛卯木'] },
    离: { inner: ['己卯木', '己丑土', '己亥水'], outer: ['己酉金', '己未土', '己巳火'] },
    坤: { inner: ['乙未土', '乙巳火', '乙卯木'], outer: ['癸丑土', '癸亥水', '癸酉金'] },
    兑: { inner: ['丁巳火', '丁卯木', '丁丑土'], outer: ['丁亥水', '丁酉金', '丁未土'] },
};
export const ELEMENT_RELATIONS = {
    金: { 生: '水', 克: '木', 被生: '土', 被克: '火', 同类: '金' },
    木: { 生: '火', 克: '土', 被生: '水', 被克: '金', 同类: '木' },
    水: { 生: '木', 克: '火', 被生: '金', 被克: '土', 同类: '水' },
    火: { 生: '土', 克: '金', 被生: '木', 被克: '水', 同类: '火' },
    土: { 生: '金', 克: '水', 被生: '火', 被克: '木', 同类: '土' },
};
/** 十二长生正位表（水土同宫：水/土长生在申、帝旺在子、墓在辰、绝在巳） */
export const CHANGSHENG_TABLE = {
    金: { 巳: '长生', 午: '沐浴', 未: '冠带', 申: '临官', 酉: '帝旺', 戌: '衰', 亥: '病', 子: '死', 丑: '墓', 寅: '绝', 卯: '胎', 辰: '养' },
    木: { 亥: '长生', 子: '沐浴', 丑: '冠带', 寅: '临官', 卯: '帝旺', 辰: '衰', 巳: '病', 午: '死', 未: '墓', 申: '绝', 酉: '胎', 戌: '养' },
    水: { 申: '长生', 酉: '沐浴', 戌: '冠带', 亥: '临官', 子: '帝旺', 丑: '衰', 寅: '病', 卯: '死', 辰: '墓', 巳: '绝', 午: '胎', 未: '养' },
    火: { 寅: '长生', 卯: '沐浴', 辰: '冠带', 巳: '临官', 午: '帝旺', 未: '衰', 申: '病', 酉: '死', 戌: '墓', 亥: '绝', 子: '胎', 丑: '养' },
    土: { 申: '长生', 酉: '沐浴', 戌: '冠带', 亥: '临官', 子: '帝旺', 丑: '衰', 寅: '病', 卯: '死', 辰: '墓', 巳: '绝', 午: '胎', 未: '养' },
};
/** 地支六冲 */
export const SIX_CHONG = {
    子: '午', 丑: '未', 寅: '申', 卯: '酉', 辰: '戌', 巳: '亥',
    午: '子', 未: '丑', 申: '寅', 酉: '卯', 戌: '辰', 亥: '巳',
};
/** 六十四卦：6 位二进制（初爻→上爻）→ 卦名 / 宫位 / 世爻位序 / 宫内序 */
export const SIXTY_FOUR_HEXAGRAMS = {
    // 乾宫八卦（金）
    '111111': { name: '乾为天', palace: '乾', generation: 6, rank: 1 },
    '011111': { name: '天风姤', palace: '乾', generation: 1, rank: 2 },
    '001111': { name: '天山遁', palace: '乾', generation: 2, rank: 3 },
    '000111': { name: '天地否', palace: '乾', generation: 3, rank: 4 },
    '000011': { name: '风地观', palace: '乾', generation: 4, rank: 5 },
    '000001': { name: '山地剥', palace: '乾', generation: 5, rank: 6 },
    '000101': { name: '火地晋', palace: '乾', generation: 4, rank: 7 },
    '111101': { name: '火天大有', palace: '乾', generation: 3, rank: 8 },
    // 坎宫八卦（水）
    '010010': { name: '坎为水', palace: '坎', generation: 6, rank: 1 },
    '110010': { name: '水泽节', palace: '坎', generation: 1, rank: 2 },
    '100010': { name: '水雷屯', palace: '坎', generation: 2, rank: 3 },
    '101010': { name: '水火既济', palace: '坎', generation: 3, rank: 4 },
    '101110': { name: '泽火革', palace: '坎', generation: 4, rank: 5 },
    '101100': { name: '雷火丰', palace: '坎', generation: 5, rank: 6 },
    '101000': { name: '地火明夷', palace: '坎', generation: 4, rank: 7 },
    '010000': { name: '地水师', palace: '坎', generation: 3, rank: 8 },
    // 艮宫八卦（土）
    '001001': { name: '艮为山', palace: '艮', generation: 6, rank: 1 },
    '101001': { name: '山火贲', palace: '艮', generation: 1, rank: 2 },
    '111001': { name: '山天大畜', palace: '艮', generation: 2, rank: 3 },
    '110001': { name: '山泽损', palace: '艮', generation: 3, rank: 4 },
    '110101': { name: '火泽睽', palace: '艮', generation: 4, rank: 5 },
    '110111': { name: '天泽履', palace: '艮', generation: 5, rank: 6 },
    '110011': { name: '风泽中孚', palace: '艮', generation: 4, rank: 7 },
    '001011': { name: '风山渐', palace: '艮', generation: 3, rank: 8 },
    // 震宫八卦（木）
    '100100': { name: '震为雷', palace: '震', generation: 6, rank: 1 },
    '000100': { name: '雷地豫', palace: '震', generation: 1, rank: 2 },
    '010100': { name: '雷水解', palace: '震', generation: 2, rank: 3 },
    '011100': { name: '雷风恒', palace: '震', generation: 3, rank: 4 },
    '011000': { name: '地风升', palace: '震', generation: 4, rank: 5 },
    '011010': { name: '水风井', palace: '震', generation: 5, rank: 6 },
    '011110': { name: '泽风大过', palace: '震', generation: 4, rank: 7 },
    '100110': { name: '泽雷随', palace: '震', generation: 3, rank: 8 },
    // 巽宫八卦（木）
    '011011': { name: '巽为风', palace: '巽', generation: 6, rank: 1 },
    '111011': { name: '风天小畜', palace: '巽', generation: 1, rank: 2 },
    '101011': { name: '风火家人', palace: '巽', generation: 2, rank: 3 },
    '100011': { name: '风雷益', palace: '巽', generation: 3, rank: 4 },
    '100111': { name: '天雷无妄', palace: '巽', generation: 4, rank: 5 },
    '100101': { name: '火雷噬嗑', palace: '巽', generation: 5, rank: 6 },
    '100001': { name: '山雷颐', palace: '巽', generation: 4, rank: 7 },
    '011001': { name: '山风蛊', palace: '巽', generation: 3, rank: 8 },
    // 离宫八卦（火）
    '101101': { name: '离为火', palace: '离', generation: 6, rank: 1 },
    '001101': { name: '火山旅', palace: '离', generation: 1, rank: 2 },
    '011101': { name: '火风鼎', palace: '离', generation: 2, rank: 3 },
    '010101': { name: '火水未济', palace: '离', generation: 3, rank: 4 },
    '010001': { name: '山水蒙', palace: '离', generation: 4, rank: 5 },
    '010011': { name: '风水涣', palace: '离', generation: 5, rank: 6 },
    '010111': { name: '天水讼', palace: '离', generation: 4, rank: 7 },
    '101111': { name: '天火同人', palace: '离', generation: 3, rank: 8 },
    // 坤宫八卦（土）
    '000000': { name: '坤为地', palace: '坤', generation: 6, rank: 1 },
    '100000': { name: '地雷复', palace: '坤', generation: 1, rank: 2 },
    '110000': { name: '地泽临', palace: '坤', generation: 2, rank: 3 },
    '111000': { name: '地天泰', palace: '坤', generation: 3, rank: 4 },
    '111100': { name: '雷天大壮', palace: '坤', generation: 4, rank: 5 },
    '111110': { name: '泽天夬', palace: '坤', generation: 5, rank: 6 },
    '111010': { name: '水天需', palace: '坤', generation: 4, rank: 7 },
    '000010': { name: '水地比', palace: '坤', generation: 3, rank: 8 },
    // 兑宫八卦（金）
    '110110': { name: '兑为泽', palace: '兑', generation: 6, rank: 1 },
    '010110': { name: '泽水困', palace: '兑', generation: 1, rank: 2 },
    '000110': { name: '泽地萃', palace: '兑', generation: 2, rank: 3 },
    '001110': { name: '泽山咸', palace: '兑', generation: 3, rank: 4 },
    '001010': { name: '水山蹇', palace: '兑', generation: 4, rank: 5 },
    '001000': { name: '地山谦', palace: '兑', generation: 5, rank: 6 },
    '001100': { name: '雷山小过', palace: '兑', generation: 4, rank: 7 },
    '110100': { name: '雷泽归妹', palace: '兑', generation: 3, rank: 8 },
};
/** 卦名 → [外卦, 内卦]（与 core.py 的 UPPER_LOWER_TRIGRAM_MAP 等价，此处由二进制派生） */
export function trigramsOfBinary(binary) {
    const lowerBits = binary.slice(0, 3);
    const upperBits = binary.slice(3, 6);
    const lower = Object.keys(TRIGRAMS).find((t) => TRIGRAMS[t].binary === lowerBits);
    const upper = Object.keys(TRIGRAMS).find((t) => TRIGRAMS[t].binary === upperBits);
    if (!lower || !upper)
        throw new Error(`非法卦象二进制：${binary}`);
    return { lower, upper };
}
/** 日干安六神 */
const SIX_GOD_START = {
    甲: '青龙', 乙: '青龙',
    丙: '朱雀', 丁: '朱雀',
    戊: '勾陈',
    己: '螣蛇',
    庚: '白虎', 辛: '白虎',
    壬: '玄武', 癸: '玄武',
};
const SIX_GODS = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
/** 日干星煞：文昌 / 禄神 / 贵人 */
const WENCHANG = {
    甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申',
    己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯',
};
const LUSHEN = {
    甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳',
    己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子',
};
const GUIREN = {
    甲: ['丑', '未'], 戊: ['丑', '未'],
    乙: ['子', '申'], 己: ['子', '申'],
    丙: ['亥', '酉'], 丁: ['亥', '酉'],
    壬: ['卯', '巳'], 癸: ['卯', '巳'],
    庚: ['寅', '午'], 辛: ['寅', '午'],
};
/** 日支三合星煞：驿马 / 桃花 */
const YIMA = {
    申: '寅', 子: '寅', 辰: '寅',
    寅: '申', 午: '申', 戌: '申',
    巳: '亥', 酉: '亥', 丑: '亥',
    亥: '巳', 卯: '巳', 未: '巳',
};
const TAOHUA = {
    申: '酉', 子: '酉', 辰: '酉',
    寅: '卯', 午: '卯', 戌: '卯',
    巳: '午', 酉: '午', 丑: '午',
    亥: '子', 卯: '子', 未: '子',
};
export class HexagramIntegrityError extends Error {
}
const SIX_CHONG_HEXAGRAMS = new Set([
    '乾为天', '坎为水', '艮为山', '震为雷', '巽为风', '离为火', '坤为地', '兑为泽',
    '天雷无妄', '雷天大壮',
]);
const SIX_HE_HEXAGRAMS = new Set([
    '天地否', '地天泰', '水泽节', '泽水困', '火山旅', '山火贲', '雷地豫', '地雷复',
]);
const YOU_HUN_HEXAGRAMS = new Set([
    '火地晋', '地火明夷', '风泽中孚', '泽风大过', '山雷颐', '天水讼', '水天需', '雷山小过',
]);
const GUI_HUN_HEXAGRAMS = new Set([
    '火天大有', '地水师', '风山渐', '泽雷随', '山风蛊', '天火同人', '水地比', '雷泽归妹',
]);
/** 依卦名给出结构标记（纯字典判定，不含吉凶） */
export function hexagramTags(name) {
    const tags = [];
    if (GUI_HUN_HEXAGRAMS.has(name))
        tags.push('归魂');
    if (YOU_HUN_HEXAGRAMS.has(name))
        tags.push('游魂');
    if (SIX_CHONG_HEXAGRAMS.has(name))
        tags.push('六冲');
    if (SIX_HE_HEXAGRAMS.has(name))
        tags.push('六合');
    return tags;
}
function splitNajia(code) {
    const stem = code[0];
    const branch = code[1];
    const element = code[2];
    return { stem, branch, element, relation: '' };
}
/**
 * 确定性排盘主入口。
 * 输入不合规即抛错（fail-closed），不做任何默认值兜底。
 */
export function castLiuyao(input) {
    const { coins, dayGz, monthBranch } = input;
    if (!Array.isArray(coins) || coins.length !== 6) {
        throw new HexagramIntegrityError('coin_results 必须为严格 6 次投掷结果列表（初爻至上爻）');
    }
    for (const c of coins) {
        if (![0, 1, 2, 3, 6, 7, 8, 9].includes(c)) {
            throw new HexagramIntegrityError('投掷数值必须在 0~3（0 老阴 / 1 少阳 / 2 少阴 / 3 老阳）或 6~9 之间');
        }
    }
    if (!/^[\u4e00-\u9fa5]{2}$/.test(dayGz)) {
        throw new HexagramIntegrityError(`日柱干支不合法：${dayGz}`);
    }
    if (!BRANCHES.includes(monthBranch)) {
        throw new HexagramIntegrityError(`月建地支不合法：${monthBranch}`);
    }
    const dayGan = dayGz[0];
    const dayBranch = dayGz[1];
    if (!STEMS.includes(dayGan) || !BRANCHES.includes(dayBranch)) {
        throw new HexagramIntegrityError(`日柱干支不合法：${dayGz}`);
    }
    // 1. 三钱投掷 → 本卦/变卦二进制（兼容 0~3 与 6~9 两种记法）
    let baseBinary = '';
    let changedBinary = '';
    const movingLines = [];
    coins.forEach((raw, idx) => {
        const c = raw === 6 ? 0 : raw === 7 ? 1 : raw === 8 ? 2 : raw === 9 ? 3 : raw;
        if (c === 3) {
            baseBinary += '1';
            changedBinary += '0';
            movingLines.push(idx + 1);
        }
        else if (c === 0) {
            baseBinary += '0';
            changedBinary += '1';
            movingLines.push(idx + 1);
        }
        else if (c === 1) {
            baseBinary += '1';
            changedBinary += '1';
        }
        else if (c === 2) {
            baseBinary += '0';
            changedBinary += '0';
        }
    });
    const baseEntry = SIXTY_FOUR_HEXAGRAMS[baseBinary];
    if (!baseEntry)
        throw new HexagramIntegrityError(`未知卦象：${baseBinary}`);
    const baseTris = trigramsOfBinary(baseBinary);
    const palace = baseEntry.palace;
    const palaceElement = TRIGRAMS[palace].element;
    // 2. 旬空：由日柱干支定旬首
    const gIdx = STEMS.indexOf(dayGan);
    const bIdx = BRANCHES.indexOf(dayBranch);
    const startBIdx = (bIdx - gIdx + 12) % 12;
    const voidBranches = [BRANCHES[(startBIdx + 10) % 12], BRANCHES[(startBIdx + 11) % 12]];
    // 3. 神煞（日/月四柱神煞，纯查表）
    const shensha = {
        yima: YIMA[dayBranch],
        taohua: TAOHUA[dayBranch],
        lushen: LUSHEN[dayGan],
        guiren: GUIREN[dayGan],
        tianyi: BRANCHES[(BRANCHES.indexOf(monthBranch) + 11) % 12],
        wenchang: WENCHANG[dayGan],
    };
    const sixRelation = (element) => {
        if (element === palaceElement)
            return '兄弟';
        if (ELEMENT_RELATIONS[palaceElement]['克'] === element)
            return '妻财';
        if (ELEMENT_RELATIONS[palaceElement]['生'] === element)
            return '子孙';
        if (ELEMENT_RELATIONS[palaceElement]['被克'] === element)
            return '官鬼';
        if (ELEMENT_RELATIONS[palaceElement]['被生'] === element)
            return '父母';
        throw new HexagramIntegrityError(`无法定六亲：宫${palaceElement} 爻${element}`);
    };
    // 4. 纳甲装卦（本卦）
    const fullNajia = [
        ...NAJIA_RULES[baseTris.lower].inner,
        ...NAJIA_RULES[baseTris.upper].outer,
    ];
    const changedNajiaCodes = movingLines.length
        ? [...NAJIA_RULES[trigramsOfBinary(changedBinary).lower].inner, ...NAJIA_RULES[trigramsOfBinary(changedBinary).upper].outer]
        : [];
    // 5. 安世应
    const worldPos = baseEntry.generation;
    const respPos = (baseEntry.generation + 3) % 6 === 0 ? 6 : (baseEntry.generation + 3) % 6;
    // 6. 六神起例
    const startGodIdx = SIX_GODS.indexOf(SIX_GOD_START[dayGan]);
    // 7. 逐爻装配
    const lines = fullNajia.map((code, i) => {
        const { stem, branch, element } = splitNajia(code);
        const isMoving = movingLines.includes(i + 1);
        let changedLine = null;
        if (isMoving && changedNajiaCodes.length) {
            const ch = splitNajia(changedNajiaCodes[i]);
            changedLine = { ...ch, relation: sixRelation(ch.element) };
        }
        const stars = [];
        if (branch === shensha.yima)
            stars.push('驿马');
        if (branch === shensha.taohua)
            stars.push('桃花');
        if (branch === shensha.lushen)
            stars.push('禄神');
        if (shensha.guiren.includes(branch))
            stars.push('贵人');
        if (branch === shensha.tianyi)
            stars.push('天医');
        if (branch === shensha.wenchang)
            stars.push('文昌');
        return {
            position: i + 1,
            isYang: baseBinary[i] === '1',
            isMoving,
            isWorld: i + 1 === worldPos,
            isResponse: i + 1 === respPos,
            stem,
            branch,
            element,
            relation: sixRelation(element),
            sixGod: SIX_GODS[(startGodIdx + i) % 6],
            hiddenSpirit: null,
            changedLine,
            isVoid: voidBranches.includes(branch),
            isMonthBroken: SIX_CHONG[monthBranch] === branch,
            stars,
        };
    });
    // 8. 伏神挂载：仅当正卦缺失某六亲时，自本宫八纯首卦同位借取
    const existing = new Set(lines.map((l) => l.relation));
    const missing = new Set(['父母', '官鬼', '兄弟', '妻财', '子孙'].filter((r) => !existing.has(r)));
    if (missing.size) {
        const pureNajia = [...NAJIA_RULES[palace].inner, ...NAJIA_RULES[palace].outer];
        pureNajia.forEach((code, i) => {
            const p = splitNajia(code);
            const pRel = sixRelation(p.element);
            if (!missing.has(pRel))
                return;
            const flyElement = lines[i].element;
            let desc = '';
            if (ELEMENT_RELATIONS[flyElement]['生'] === p.element)
                desc = '飞来生伏得长生';
            else if (ELEMENT_RELATIONS[p.element]['生'] === flyElement)
                desc = '伏去生飞名泄气';
            else if (ELEMENT_RELATIONS[flyElement]['克'] === p.element)
                desc = '飞来克伏';
            else if (ELEMENT_RELATIONS[p.element]['克'] === flyElement)
                desc = '伏克飞神为出暴';
            // 判伏神在飞爻之支上的长生状态（原引擎取飞爻地支，非同支同气）
            const cs = CHANGSHENG_TABLE[p.element][lines[i].branch];
            if (cs === '墓' || cs === '绝')
                desc += `, 伏神${cs}于飞爻`;
            lines[i].hiddenSpirit = {
                ...p,
                relation: pRel,
                stemBranch: `${p.stem}${p.branch}${p.element}`,
                flyRelationDesc: desc,
            };
        });
    }
    // 9. 月卦身：「阴世则从午月起，阳世还从子月生，从初数至世方真」
    const worldIdx = lines.findIndex((l) => l.isWorld);
    const isYangWorld = baseBinary[worldIdx] === '1';
    const startBranchIdx = BRANCHES.indexOf(isYangWorld ? '子' : '午');
    const monthBodyBranch = BRANCHES[(startBranchIdx + worldIdx) % 12];
    const monthBodyPos = lines.findIndex((l) => l.branch === monthBodyBranch) + 1;
    // 10. 变卦信息（动静俱全，六亲依本宫五行）
    const changedEntry = movingLines.length ? SIXTY_FOUR_HEXAGRAMS[changedBinary] : null;
    const changedTris = movingLines.length ? trigramsOfBinary(changedBinary) : null;
    const changedLines = changedNajiaCodes.map((code) => {
        const n = splitNajia(code);
        return { ...n, relation: sixRelation(n.element) };
    });
    const base = {
        binary: baseBinary,
        name: baseEntry.name,
        palace,
        palaceElement,
        generation: baseEntry.generation,
        rank: baseEntry.rank,
        upper: baseTris.upper,
        lower: baseTris.lower,
        tags: hexagramTags(baseEntry.name),
    };
    const changed = changedEntry && changedTris
        ? {
            binary: changedBinary,
            name: changedEntry.name,
            palace: changedEntry.palace,
            palaceElement: TRIGRAMS[changedEntry.palace].element,
            generation: changedEntry.generation,
            rank: changedEntry.rank,
            upper: changedTris.upper,
            lower: changedTris.lower,
            tags: hexagramTags(changedEntry.name),
        }
        : null;
    return {
        input,
        base,
        changed,
        movingLines,
        lines,
        changedLines,
        voidBranches,
        monthBody: { branch: monthBodyBranch, position: monthBodyPos },
        shensha,
    };
}
