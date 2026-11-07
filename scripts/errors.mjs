/**
 * 失败关闭：错误码与异常类（qigua-najia-v1）
 *
 * 设计原则：任何不确定、冲突、缺信息的情形一律抛错停止，
 * 绝不返回「大致可用」的卦盘，也绝不让调用方（含 LLM）事后修补数据。
 */

/** 输入格式/范围/名称无法唯一映射（含非法正整数、非法时区、未知卦名） */
export const INVALID_INPUT = 'INVALID_INPUT';
/** 只给了本卦，没有动爻、没有变卦、也没有「静卦」声明 */
export const MISSING_CHANGE_INFORMATION = 'MISSING_CHANGE_INFORMATION';
/** 爻值 / 本卦 / 变卦 / 动爻 之间互相矛盾 */
export const CONFLICTING_HEXAGRAM_INPUT = 'CONFLICTING_HEXAGRAM_INPUT';
/** 引擎返回的卦盘与本 Skill 的计算结果不一致（引擎或数据被改坏） */
export const INTERNAL_CONSISTENCY_ERROR = 'INTERNAL_CONSISTENCY_ERROR';

export class QiguaError extends Error {
  constructor(code, message, details) {
    super(`[${code}] ${message}`);
    this.name = 'QiguaError';
    this.code = code;
    this.detail = details ?? null;
  }
}

export function fail(code, message, details) {
  throw new QiguaError(code, message, details);
}

/** CLI 用：把异常序列化成稳定的错误对象（不吞错，只格式化） */
export function errorPayload(err) {
  if (err instanceof QiguaError) {
    return {
      ok: false,
      error: { code: err.code, message: err.message, detail: err.detail ?? null },
      fail_closed: true,
    };
  }
  return {
    ok: false,
    error: {
      code: INTERNAL_CONSISTENCY_ERROR,
      message: err && err.message ? err.message : String(err),
      detail: null,
    },
    fail_closed: true,
  };
}
