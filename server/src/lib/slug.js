/**
 * 生成文章 slug：优先从标题里提取 ASCII 单词；中文标题会退化为 post-xxxx。
 * 唯一性由调用方（ArticleService）保证。
 * @param {string} input
 * @param {{ maxLength?: number }} [options]
 */
export function slugify(input, options = {}) {
  const { maxLength = 72 } = options;
  const ascii = String(input ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

  if (ascii.length >= 2) return ascii;

  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `post-${stamp}-${random}`;
}
