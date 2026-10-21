/**
 * 极简 Markdown 渲染器（够看博客正文用）。
 *
 * 安全策略：先把原文整体转义，再只拼接本函数生成的标签，
 * 保证文章内容里不可能执行原生 HTML / 脚本。
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ESCAPE_MAP[character]);
}

function renderInline(text) {
  let html = text;
  html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
    (_, label, url) =>
      `<a href="${url}" rel="noopener noreferrer"${url.startsWith('http') ? ' target="_blank"' : ''}>${label}</a>`,
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return html;
}

const BLOCK_STARTERS = /^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+[.)]\s)/;

/**
 * @param {string} source Markdown 原文
 * @returns {string} 安全的 HTML 片段
 */
export function renderMarkdown(source) {
  const escaped = escapeHtml(String(source ?? '').replace(/\r\n?/g, '\n'));
  const lines = escaped.split('\n');
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    // 代码块
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const languageClass = language ? ` class="language-${escapeHtml(language)}"` : '';
      html.push(`<pre><code${languageClass}>${code.join('\n')}</code></pre>`);
      continue;
    }

    // 空行
    if (!line.trim()) {
      index += 1;
      continue;
    }

    // 标题（正文最高从 h2 开始）
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4) + 1;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(renderInline(lines[index].replace(/^\s*>\s?/, '')));
        index += 1;
      }
      html.push(`<blockquote>${quote.join('<br>')}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\s*\d+[.)]\s+/, ''))}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // 分割线
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    // 段落
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !BLOCK_STARTERS.test(lines[index])) {
      paragraph.push(renderInline(lines[index]));
      index += 1;
    }
    html.push(`<p>${paragraph.join('<br>')}</p>`);
  }

  return html.join('\n');
}
