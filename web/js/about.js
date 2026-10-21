import { getSite } from './api.js';
import { renderMarkdown } from './markdown.js';

const $ = (selector, root = document) => root.querySelector(selector);

/** 「关于」页的标签也存在主库 site_settings 里，用逗号分隔。 */
function renderTags(raw) {
  const list = $('#about-tags');
  if (!list || !raw) return;
  const tags = String(raw)
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length === 0) return;
  list.replaceChildren(
    ...tags.map((tag) => {
      const item = document.createElement('li');
      item.textContent = tag;
      return item;
    }),
  );
}

function applySite(site) {
  for (const node of document.querySelectorAll('[data-site]')) {
    const value = site[node.dataset.site];
    if (value) node.textContent = value;
  }

  const text = $('#about-text');
  if (text && site.aboutText) text.innerHTML = renderMarkdown(site.aboutText);

  renderTags(site.aboutTags);
  document.title = `${site.aboutTitle || '关于'} · ${site.title || '刀盾的小屋'}`;
}

async function boot() {
  try {
    const data = await getSite();
    if (data?.site) applySite(data.site);
  } catch (error) {
    // 后端不可用时保留 HTML 里的静态兜底内容
    console.warn('关于页内容读取失败，使用静态兜底内容：', error);
  }
}

boot();
