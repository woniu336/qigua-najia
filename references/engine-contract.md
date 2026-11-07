# 引擎接口契约（qigua-najia-v1）

> 本文是**唯一**的输入/输出协议说明。CLI 与库函数共用同一份契约：
> `scripts/cast.mjs::runCast(input)` 返回的对象 = `node scripts/cast.mjs --format json` 的 stdout。
>
> 算法版本：`qigua-najia-v1`（写死在每个输出的 `algorithm_version` / `source.algorithm_version`）。

---

## 1. 输入 JSON（`runCast` / `--file` / stdin）

```jsonc
{
  "source_method": "MEIHUA_TIME | MEIHUA_TWO_NUMBERS | EXTERNAL_HEXAGRAM_INPUT",
  "question": "所问事项与缘由（可空，会截断到 500 字）",

  // ── 仅 MEIHUA_TIME ────────────────────────────────────────────
  "meihua_reference_time": "2025-01-16 15:30",   // 或 ISO8601，或 "now"
  "meihua_timezone": "Asia/Shanghai",            // 必填，禁设备时区兜底
  "meihua_time_source": "事件发生时间 / 原始发布时间 / 现场起念时间",  // 可选，写进卦源说明

  // ── 仅 MEIHUA_TWO_NUMBERS ────────────────────────────────────
  "two_numbers": [5, 3],                          // 或 {"a":5,"b":3}；正整数
  // 两数法不做梅花取数，但仍需下面的 najia_cast_at 供装卦

  // ── 仅 EXTERNAL_HEXAGRAM_INPUT ───────────────────────────────
  "external": {
    "input_mode": "SIX_LINE_VALUES | ORIGINAL_PLUS_CHANGED | ORIGINAL_PLUS_MOVING_LINES | ORIGINAL_STATIC",
    "acquisition_method": "COIN_TOSS | YARROW | EXTERNAL_APP | OTHER | UNKNOWN",

    "six_line_values": [7, 8, 9, 7, 8, 8],         // 六爻爻值，初爻→上爻（第一次摇卦=初爻）
    "original_hexagram": "泽火革",                  // 六十四卦全名
    "changed_hexagram": "泽山咸",                   // 六十四卦全名
    "moving_lines": [1],                            // 1=初爻 … 6=上爻；可为空数组
    "is_static": false                              // ORIGINAL_STATIC 时必须为 true
  },

  // ── 排盘基准：二选一（公历时间 或 干支直输），不是两个都要 ─────
  "najia_cast_at": "2025-01-16 15:30",            // 或 "now"；历史卦必须填原始起卦时间
  "najia_timezone": "Asia/Shanghai",
  // 或者（用户只给「申月 丙子日」时用这组，给了就不需要上面两个）：
  // "najia_ganzhi": "申月 丙子日",              // 也接受 "乙巳年 甲申月 丙子日 申时"
  // "najia_month_branch": "申", "najia_day_gz": "丙子",
  // "najia_year_gz": "乙巳",                    // 可选，仅显示
  // "najia_hour_branch": "申",                  // 可选，装卦不使用时支
  "najia_time_source": "现场自动记录 / 用户手动填写 / 第三方记录 / 来源不明"
}
```

规则摘要：

- **两把时间不许混**：`meihua_reference_time` 只喂梅花取数，`najia_cast_at` 只喂纳甲月建/日辰/六神/旬空。
  时间法可两者同刻（`same_moment=true`），也可「事件时间取数 + 占问时间装卦」（`same_moment=false`，输出会明示）。
- 外部输入**不得**带 `meihua_reference_time`（`INVALID_INPUT`）。
- `najia_cast_at` 缺省仅在 `MEIHUA_TIME` 时回退为 `meihua_reference_time`；其余入口缺失即 `INVALID_INPUT`。
- 时区缺省一律 `INVALID_INPUT`（绝不使用运行机器的本地时区）。
- **干支直输**：`najia_ganzhi`（或 `najia_month_branch` + `najia_day_gz`）可直接给月建与日柱，
  **不需要公历日期**；`solar`/`lunar` 记为「未提供（按用户给定干支直接排盘）」，
  `najia_baseline.time_source_kind = "GANZHI_DIRECT"`，`month_build_source` 写「用户直接给定的干支」。
  与 `najia_cast_at` 同时给且矛盾（月建/日柱/年柱/时支）→ `INVALID_INPUT`，不替用户择一。
  梅花两法不得用干支直输（梅花取数需要农历年月日时）。

### 1.1 CLI 参数 ↔ JSON 字段

| CLI | JSON |
|---|---|
| `--time "2025-01-16 15:30"` | `source_method=MEIHUA_TIME` + `meihua_reference_time` |
| `--tz Asia/Shanghai` | `meihua_timezone`（同时作为 `najia_timezone` 的缺省） |
| `--time-source "..."` | `meihua_time_source` |
| `--numbers 5 3` | `source_method=MEIHUA_TWO_NUMBERS` + `two_numbers` |
| `--external a.json` / `--external '{"...":...}'` / `--external -` | `external` |
| `--najia-cast-at "..."` | `najia_cast_at` |
| `--najia-ganzhi "申月 丙子日"` | `najia_ganzhi`（干支直输，无需公历日期） |
| `--najia-month 申` / `--najia-day 丙子` / `--najia-year 乙巳` / `--najia-hour 申` | 对应分项字段 |
| `--najia-tz <IANA>` | `najia_timezone` |
| `--najia-time-source "..."` | `najia_time_source` |
| `--now` | 把缺失的 `najia_cast_at` 填 `now`（显式声明） |
| `--question "..."` | `question` |
| `--file p.json` / 位置参数 / stdin | 整份输入 JSON |
| `--format json\|text` | 输出格式（默认 text） |
| `--out p.json` | 另存 JSON 结果 |

---

## 2. 输出对象（成功）

```jsonc
{
  "ok": true,
  "algorithm_version": "qigua-najia-v1",

  "source": {                       // ← 「卦源说明」，必须先给用户看
    "source_method": "MEIHUA_TIME",
    "source_method_label": "梅花时间起卦（年月日时）",
    "acquisition_method": "MEIHUA_COMPUTED",       // 外部输入时为 COIN_TOSS/YARROW/EXTERNAL_APP/OTHER/UNKNOWN
    "acquisition_label": "确定性代码计算（非铜钱摇卦、非蓍草、非外部工具）",
    "input_mode": "TIME",                          // 外部为四种模式之一
    "input_mode_label": "时间（年支/农历月/农历日/时支）",
    "najia_engine": "京房纳甲六爻引擎（由 liuyao/bazi-web NajiaEngine 编译复制，未改任何规则）",
    "engine_provenance": "scripts/engine/najia.mjs ← liuyao/lib/liuyao/najia.ts",
    "duangua_system": "纳甲六爻（京房纳甲 · 世应 · 六亲 · 六神 · 旬空 · 伏神）",
    "fact_source": "确定性排盘引擎输出；本 Skill 不重算纳甲/世应/六亲/六神/旬空/月建日辰",
    "algorithm_version": "qigua-najia-v1",
    "meihua_time_source": null,
    "najia_time_source": null,
    "question": "所问事项"
  },

  "time_bases": {
    "meihua_reference_time": { "input": "...", "timezone": "...", "wall_clock": "...", "utc": "..." },  // 外部输入为 null
    "najia_cast_at": { "kind": "WALL_CLOCK", "input": "...", "timezone": "...", "wall_clock": "...", "utc": "...",
                       "resolved_from": "...", "dst_ambiguous": false, "source_note": null },
    // 干支直输时：{ "kind": "GANZHI_DIRECT", "input": "申月 丙子日", "timezone": null, "wall_clock": null, "utc": null }
    "same_moment": true
  },

  "meihua": {                       // 仅梅花两法；外部输入为 null
    "method": "MEIHUA_TIME | MEIHUA_TWO_NUMBERS",
    "reference_time": { ... },      // 时间法有；两数法为 null
    "numbers": { /* 时间法：year_zhi_number/lunar_month/lunar_day/hour_zhi_number/S1/S2/
                     upper_remainder/lower_remainder/moving_remainder/formula
                     两数法：A/B/sum/upper_remainder/lower_remainder/moving_remainder/formula */ },
    "calendar": { "year_zhi": "辰", "year_zhi_exact_reference_only": "辰",
                  "lunar_month": 12, "lunar_month_raw": 12, "is_leap_month": false,
                  "lunar_day": 17, "hour_zhi": "申", "lunar_text": "二〇二四年 农历腊月十七", "...": "..." },
    "hexagram": { "upper": "兑", "lower": "离", "upper_number": 2, "lower_number": 3,
                  "binary": "101110", "name": "泽火革", "moving_lines": [1],
                  "changed_binary": "001110", "changed_name": "泽山咸",
                  "line_values_bottom_up": [9,8,7,7,7,8], "is_static": false }
  },

  "external": {                     // 仅外部输入；梅花入口为 null
    "input_mode": "SIX_LINE_VALUES", "input_mode_label": "六爻爻值（6/7/8/9，初爻→上爻）",
    "acquisition_method": "COIN_TOSS", "acquisition_label": "铜钱手摇",
    "original_hexagram_id": "101010", "original_hexagram_name": "水火既济",
    "line_values_bottom_up": [7,8,7,8,7,8], "supplied_line_values": [7,8,7,8,7,8],
    "moving_lines": [], "is_static": true,
    "changed_hexagram_id": null, "changed_hexagram_name": null,
    "moving_lines_echo": [ { "position": 1, "position_label": "初爻", "original": "阳", "changed": null } ],
    "echo": { "original_hexagram": null, "changed_hexagram": null, "six_line_values": [...],
              "moving_lines": null, "is_static": false },
    "checks": { "name_to_hexagram_unique": true, "lines_bottom_up_order": "初爻→上爻（自下而上）",
                "changed_equals_flip_of_all_moving_lines": true,
                "fake_changed_hexagram_absent": true, "multi_moving_lines_preserved": true },
    "notes": []
  },

  "hexagram": {
    "original_hexagram_id": "101110",            // ← 六十四卦 ID = 6 位二进制（初爻→上爻）
    "original_hexagram_name": "泽火革",
    "upper_trigram": "兑", "lower_trigram": "离",
    "line_values_bottom_up": [9,8,7,7,7,8],
    "moving_lines": [1],
    "is_static": false,
    "changed_hexagram_id": "001110", "changed_hexagram_name": "泽山咸",
    "changed_upper_trigram": "兑", "changed_lower_trigram": "艮",
    "order_convention": "爻值数组与二进制均为初爻→上爻（自下而上）；动爻位置 1=初爻 … 6=上爻"
  },

  "najia_baseline": {               // 纳甲排盘基准（节气月建，与梅花农历月无关）
    "solar": "2025年1月16日 15:30", "lunar": "二〇二四年 农历腊月十七",
    "ganzhi": "甲辰年 丁丑月 乙酉日 甲申时",
    "year_gz": "甲辰", "month_gz": "丁丑", "day_gz": "乙酉", "hour_gz": "甲申",
    "month_branch": "丑", "day_branch": "酉", "hour_branch": "申",
    "month_build_source": "节气月（纳甲口径；与梅花取数用的农历月无关）"
  },

  "consistency": { "engine_matches_computation": true,
                   "checked": ["base_binary","base_name","moving_lines","changed_binary",
                               "static_has_no_changed","line_values"] },

  "facts": { /* 见 §3：交给断卦规范的权威事实包 */ }
}
```

失败时输出（stderr，退出码 2）：

```jsonc
{ "ok": false,
  "error": { "code": "MISSING_CHANGE_INFORMATION", "message": "[MISSING_CHANGE_INFORMATION] ...", "detail": null },
  "fail_closed": true }
```

---

## 3. 事实包 `facts`（唯一权威排盘数据）

移植自 `liuyao/lib/readings/facts.ts`（逐行等价，仅路径别名改相对导入）。

```jsonc
{
  "kind": "liuyao",
  "question": "...",
  "time": { "solar": "2025年1月16日 15:30", "lunar": "二〇二四年 农历腊月十七",
            "ganzhi": "甲辰年 丁丑月 乙酉日 甲申时" },
  "base":    { "name": "泽火革", "palace": "坎", "element": "水", "tags": [] },
  "changed": { "name": "泽山咸", "palace": "兑", "element": "金", "tags": [] },   // 静卦为 null
  "movingLines": [1],
  "voidBranches": ["午", "未"],                       // 旬空
  "monthBody": { "branch": "卯", "position": 1 },      // 月卦身
  "shensha": { "guiren": "子、申", "lushen": "卯", "yangren": "寅", "wenchang": "午",
               "yima": "亥", "taohua": "午", "jiangxing": "酉", "huagai": "丑",
               "mouxing": "未", "jiesha": "寅", "zaisha": "卯", "tianyi": "子", "tianxi": "未" },
  "lines": [                                          // 自下而上 6 条
    { "position": 1, "sixGod": "青龙", "relation": "子孙", "najia": "己卯木",
      "isYang": true, "isMoving": true, "isWorld": false, "isResponse": true,
      "void": false, "monthBroken": false,
      "stars": ["禄神"],
      "hidden":  { "relation": "妻财", "najia": "戊午火" },        // 有伏神时出现
      "changed": { "relation": "官鬼", "najia": "丙辰土" } },
    { "position": 2, "...": "..." }
  ],
  "oracle": {
    "baseGuaCi": "革，己日乃孚，元亨，利贞，悔亡。",
    "changedGuaCi": "亨，利贞，取女吉。",               // 静卦为 null
    "movingLines": [ { "position": 1, "text": "初九：巩用黄牛之革。" } ],
    "yong": null                                        // 六爻全动且乾/坤时才有用九/用六
  }
}
```

### 3.1 与断卦规范 §零.3 字段清单的对应

| 规范要求字段 | 本契约位置 |
|---|---|
| 起卦公历 / 农历 / 年·月·日·时干支 | `facts.time.solar / lunar / ganzhi`（另 `najia_baseline.*` 分列） |
| 月建 | `najia_baseline.month_branch`（`facts.time.ganzhi` 内也有月柱） |
| 日辰 | `najia_baseline.day_gz` |
| 旬空 | `facts.voidBranches` |
| 本卦 / 变卦 / 卦宫与宫五行 / 结构标签 | `facts.base`、`facts.changed`（`palace`/`element`/`tags`：六冲/六合/游魂/归魂） |
| 六神 / 六亲 / 纳甲干支五行 / 世应 / 动静 / 伏神 / 动化 | `facts.lines[*]` 的 `sixGod`/`relation`/`najia`/`isWorld`·`isResponse`/`isMoving`/`hidden`/`changed` |
| 神煞 13 项 | `facts.shensha` |
| 经文（本卦卦辞 / 变卦卦辞 / 动爻爻辞 / 用九用六） | `facts.oracle.*` |
| 月卦身（规范未要求，附加） | `facts.monthBody` |

清单外的字段一律视为「未提供」，断卦时不得自行补算。

---

## 4. 引擎来源与重建（provenance）

| 文件 | 来源 | 处理 |
|---|---|---|
| `scripts/engine/najia.mjs` | `liuyao/lib/liuyao/najia.ts`（520 行，零依赖） | tsc 编译后改扩展名 `.mjs`，未改一行逻辑 |
| `scripts/engine/ganzhi.mjs` | `liuyao/lib/liuyao/ganzhi.ts`（76 行，依赖 lunar-javascript） | 同上（`import type` 被 tsc 擦除） |
| `scripts/engine/shensha.mjs` | `liuyao/lib/zhanbu/shensha.ts`（《古筮真诠》十三神煞） | 同上 |
| `scripts/engine/oracle-text.mjs` | `liuyao/lib/hexagram/oracle-text.ts`（64 卦卦爻辞） | 同上 |
| `scripts/engine/facts.mjs` | `liuyao/lib/readings/facts.ts`（110 行） | **手工移植**：`@/lib/...` 别名 → 相对 `.mjs`；逻辑不变 |
| `node_modules/lunar-javascript` | `liuyao/node_modules/lunar-javascript`（1.7.7，MIT） | 整包复制，保证自包含 |

- 复制基线：liuyao 仓库 `main` @ `0801dca`（引擎五个源文件自 `77b0d75` 起未再变动，已逐文件核对）。
- 断卦规范复制基线：`docs/prompt-liuyao.md` @ `0801dca`，`sha256=c72d0011bf6784de7667ad543089061b699d413fbe894b3b29469a89093dddc5`（157,415 字符 / 58,890 字）。
  上游之后若续改规范，重新 `cp` 覆盖 `references/duangua-prompt.md` 并更新此处 hash 即可；**本 Skill 永不修改规范正文**。
- 编译命令（在原仓库里执行即可复现）：

```bash
npx tsc najia.ts ganzhi.ts shensha.ts oracle-text.ts \
  --outDir out --module esnext --target es2020 \
  --moduleResolution bundler --skipLibCheck
```

- 板端注意：Node 默认按**系统本地时区**解释 `Date`。本 Skill 的做法是先把目标时区的墙上时间
  算成「本地字段恰好等于该墙上时间」的 `Date`，再交给 `lunar-javascript`，
  因此结果与运行机器的时区无关（见 `scripts/cast.mjs::resolveMoment`）。
- `lunar.getTimeZhi()` 在 23:00 后按「晚子时」给时干，但**时支仍是子**，
  本 Skill 只取时支，故无影响；纳甲日柱取 `getDayInGanZhiExact()`，仍属当日。

---

## 5. 库函数接口（供脚本二次调用）

```js
import { runCast, renderText } from './scripts/cast.mjs';
const result = runCast({ source_method: 'MEIHUA_TWO_NUMBERS', two_numbers: [5, 3],
                         najia_cast_at: 'now', najia_timezone: 'Asia/Shanghai' });
process.stdout.write(renderText(result));
```

```js
import { castMeihuaTime, castMeihuaTwoNumbers, meihuaTimeNumbers,
         remainderToEight, remainderToSix } from './scripts/meihua.mjs';
import { normalizeExternal } from './scripts/external.mjs';
```

纯函数无副作用、无全局状态；同输入两次调用结果必须完全一致（有测试保证）。
