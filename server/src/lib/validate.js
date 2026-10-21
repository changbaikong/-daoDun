import { validationError } from './errors.js';

function fail(field, message) {
  throw validationError({ [field]: message });
}

/**
 * 读取并校验文本字段。字段缺失时：required=true 报错，否则返回 undefined。
 * @param {Record<string, unknown>} input
 * @param {string} field
 * @param {{ label?: string, required?: boolean, min?: number, max?: number, trim?: boolean }} [options]
 */
export function readString(input, field, options = {}) {
  const { label = field, required = false, min = 0, max = 10_000, trim = true } = options;
  const raw = input?.[field];
  if (raw === undefined || raw === null) {
    if (required) fail(field, `${label}不能为空`);
    return undefined;
  }
  if (typeof raw !== 'string') fail(field, `${label}必须是文本`);
  const value = trim ? raw.trim() : raw;
  if (required && value.length === 0) fail(field, `${label}不能为空`);
  if (value.length > 0 && value.length < min) fail(field, `${label}至少需要 ${min} 个字符`);
  if (value.length > max) fail(field, `${label}不能超过 ${max} 个字符`);
  return value;
}

/**
 * 读取枚举字段。缺失时返回 defaultValue（可能为 undefined）。
 * @param {Record<string, unknown>} input
 * @param {string} field
 * @param {readonly string[]} values
 * @param {{ label?: string, defaultValue?: string }} [options]
 */
export function readEnum(input, field, values, options = {}) {
  const { label = field, defaultValue } = options;
  const raw = input?.[field];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  if (typeof raw !== 'string' || !values.includes(raw)) {
    fail(field, `${label}只能是 ${values.join(' / ')}`);
  }
  return raw;
}

/**
 * 读取整数（也兼容查询字符串里的数字）。
 * @param {Record<string, unknown>} input
 * @param {string} field
 * @param {{ label?: string, min?: number, max?: number, defaultValue?: number }} [options]
 */
export function readInt(input, field, options = {}) {
  const { label = field, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, defaultValue } = options;
  const raw = input?.[field];
  if (raw === undefined || raw === null || raw === '') {
    if (defaultValue !== undefined) return defaultValue;
    fail(field, `${label}不能为空`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(field, `${label}需要是 ${min} - ${max} 之间的整数`);
  }
  return value;
}

/**
 * 读取标签：支持字符串（逗号/空格分隔）或字符串数组，自动去重去空。
 * @param {Record<string, unknown>} input
 * @param {string} [field]
 * @param {{ label?: string, max?: number, maxLength?: number }} [options]
 */
export function readTags(input, field = 'tags', options = {}) {
  const { label = '标签', max = 8, maxLength = 24 } = options;
  const raw = input?.[field];
  if (raw === undefined || raw === null) return undefined;

  let list;
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string') list = raw.split(/[,，\s]+/);
  else fail(field, `${label}格式不正确`);

  const tags = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const tag = item.trim();
    if (!tag) continue;
    if (tag.length > maxLength) fail(field, `单个${label}不能超过 ${maxLength} 个字符`);
    if (tags.includes(tag)) continue;
    if (tags.length >= max) fail(field, `最多只能有 ${max} 个${label}`);
    tags.push(tag);
  }
  return tags;
}
