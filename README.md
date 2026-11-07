# qigua-najia · 六爻起卦 Skill

> 起卦入口与纳甲六爻断卦：**梅花两法 + 外部卦象输入 + 内置京房纳甲引擎 + 断卦规范**。
> 所有数值由确定性代码计算，模型只负责取用与断卦。

这是一个给 AI Agent 用的 Skill（Claude Code / Pi / Codex / Cursor 等均可直接读 `SKILL.md`），
也可以完全当作一个**命令行排盘工具**使用。

## 特点

- **三种入口**
  - 梅花年月日时（时间起卦，含《观梅占》样例）
  - 梅花两数报数（A→上卦、B→下卦、动爻 (A+B)%6）
  - 外部卦象输入：六爻爻值 `[6,7,8,9]` / 本卦+变卦 / 本卦+动爻 / 明确静卦
- **确定性装卦**：纳甲、世应、六亲、六神、旬空、月破、伏神、神煞（十三种）、月卦身、卦爻辞
- **零心算**：取数、余数、上下卦、动爻、变卦、动爻识别全部由代码完成，模型不得猜卦、不得反推爻画
- **失败关闭**：输入不完整或自相矛盾就报错停下，不让模型替你补数据
- **够了就别问**：卦象 + 时间（公历或干支）+ 事由齐了就直接排盘；给干支时不需要公历日期
- **断卦规范全文内置**：`references/duangua-prompt.md`（24 章，约 5.9 万字），整份发送、不做关键词选章

## 快速开始

```bash
git clone https://github.com/woniu336/qigua-najia.git
cd qigua-najia
npm install            # 唯一依赖 lunar-javascript（农历/干支）
node --test tests/*.test.mjs   # 34 项测试
```

### 1. 梅花时间法

```bash
node scripts/cast.mjs \
  --time "2025-01-16 15:30" --tz Asia/Shanghai \
  --question "朋友的父亲昨天走失，家属已报警，想问老人目前是否平安。"
```

输出 `泽火革 → 泽山咸，初爻动`（即《梅花易数·观梅占》原例：辰年腊月十七申时）。

### 2. 梅花两数报数

```bash
node scripts/cast.mjs --numbers 5 3 --tz Asia/Shanghai --now \
  --question "换工作，已面试两家，想问其中一家是否给录用机会。"
```

`5 / 3 → 风火家人 → 风天小畜，二爻动`。

### 3. 外部卦象输入

```bash
# 模式一：六爻爻值（初爻→上爻）
node scripts/cast.mjs --external '{"input_mode":"SIX_LINE_VALUES","acquisition_method":"COIN_TOSS","six_line_values":[6,7,9,7,8,9]}' \
  --najia-cast-at "2025-01-16 15:30" --najia-tz Asia/Shanghai --question "卖房能否顺利成交？"

# 模式二：本卦 + 变卦（代码反推动爻）
node scripts/cast.mjs --external '{"input_mode":"ORIGINAL_PLUS_CHANGED","acquisition_method":"EXTERNAL_APP","original_hexagram":"泽火革","changed_hexagram":"泽山咸"}' \
  --najia-cast-at "2025-01-16 15:30" --najia-tz Asia/Shanghai

# 模式三：本卦 + 动爻
node scripts/cast.mjs --external '{"input_mode":"ORIGINAL_PLUS_MOVING_LINES","original_hexagram":"风火家人","moving_lines":[2]}' \
  --najia-cast-at "2025-01-16 15:30" --najia-tz Asia/Shanghai

# 模式四：明确静卦
node scripts/cast.mjs --external '{"input_mode":"ORIGINAL_STATIC","original_hexagram":"水火既济","is_static":true}' \
  --najia-cast-at "2025-01-16 15:30" --najia-tz Asia/Shanghai
```

### 4. 干支直输（只给「月建 + 日柱」，无需公历日期）

```bash
node scripts/cast.mjs   --external '{"input_mode":"ORIGINAL_PLUS_CHANGED","original_hexagram":"地火明夷","changed_hexagram":"雷山小过"}'   --najia-ganzhi "申月 丙子日"   --question "占出行"
```

月建 申 / 日辰 丙子 / 旬空 申酉 / 六神按日干起（丙日初爻朱雀），与用公历时间排出的盘逐字一致。
也支持分项：`--najia-month 申 --najia-day 丙子 --najia-hour 申`。

`--format json` 只输出 JSON；`--out result.json` 写文件；`--file input.json` 或 stdin 读整份输入。

## 目录结构

```
SKILL.md                      Skill 入口：铁律、工作流程、命令、错误码、反模式
references/
  method-spec.md              梅花两法 / 外部四模式的公式与校验
  source-notes.md             古籍依据、两数法的现代口径边界、观梅占样例
  engine-contract.md          输入输出协议、错误码、算法版本、提示词基线 sha256
  duangua-prompt.md           断卦规范全文（24 章）
scripts/
  cast.mjs                    CLI：校验 → 算卦 → 装卦 → 输出卦源说明 + 事实包
  meihua.mjs                  梅花时间法 / 两数法（纯函数）
  external.mjs                外部卦象四模式标准化 + 冲突检测
  errors.mjs                  错误码
  engine/                     纳甲引擎（najia / ganzhi / shensha / oracle-text / facts）
tests/
  cast.test.mjs, fixtures.json
```

## 两个时间必须分开

| 字段 | 用途 |
|---|---|
| `meihua_reference_time` | 梅花取数用的时间（农历年支 + 农历月 + 农历日 + 时支） |
| `najia_cast_at` | 纳甲装卦用的时间（月建、日辰、六神、旬空） |

外部卦象输入只有后者，**不得伪造**梅花取数时间；历史卦必须用原始起卦时间，不得默认当前时间。

梅花口径：**农历年支**（正月初一换年）、农历月（闰月取绝对值）、农历日、**时支**；
不使用节气月 / 立春换年 / 八字月柱。

## 错误码（失败关闭）

| 代码 | 含义 |
|---|---|
| `MISSING_CHANGE_INFORMATION` | 只给本卦，没给动爻/变卦/静卦声明 |
| `CONFLICTING_HEXAGRAM_INPUT` | 爻值、本卦、变卦、动爻互相矛盾 |
| `INTERNAL_CONSISTENCY_ERROR` | 引擎自检不一致 |
| `INVALID_INPUT` | 格式、卦名、时间非法 |

出错就停，**不替用户修补数据**，也不「选一套」继续算。

## 断卦输出

默认四段：**取用 / 盘面 / 走势 / 应期**，正文 400–550 字；开头保留脚本给的「卦源说明」
（来源类型 / 取得方式 / 输入模式 / 纳甲引擎 / 事实来源 / 算法版本）。

## 免责声明

本项目为传统术数（六爻纳甲）的**文化研究与软件工程实践**，输出不构成医疗、法律、投资、
安全等任何专业建议；涉及现实风险（就医、报警、人身安全）请以专业渠道为准。

## License

MIT
