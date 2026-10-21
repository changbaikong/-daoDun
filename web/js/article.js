import { getArticle, getSite } from './api.js';
import { renderMarkdown } from './markdown.js';

/**
 * 文章独立页面：/articles/<username>/<id>
 * 地址里带着账号名，因为文章 ID 只在各自账号库内唯一。
 */
const state = { site: null };

const $ = (selector, root = document) => root.querySelector(selector);

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function siteTitle() {
  return state.site?.title || '刀盾的小屋';
}

function parseRoute() {
  const match = /^\/articles\/([^/]+)\/([^/]+)\/?$/.exec(window.location.pathname);
  if (!match) return null;
  try {
    return {
      username: decodeURIComponent(match[1]),
      id: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

function applySite(site) {
  if (!site) return;
  state.site = site;
  for (const node of document.querySelectorAll('[data-site]')) {
    const value = site[node.dataset.site];
    if (value) node.textContent = value;
  }
}

function renderLoading() {
  $('#article-kicker').textContent = 'Article';
  $('#article-title').textContent = '正在打开文章…';
  $('#article-meta').replaceChildren();
  $('#article-body').replaceChildren(el('p', 'reader-loading', '正在从账号库里取回文章…'));
  $('#article-foot').hidden = true;
}

function renderArticle({ article, author }) {
  $('#article-kicker').textContent = author?.nickname || 'Article';
  $('#article-title').textContent = article.title;
  document.title = `${article.title} · ${siteTitle()}`;

  const meta = $('#article-meta');
  meta.replaceChildren();
  meta.append(el('span', 'reader-author', `@${author?.username || 'unknown'}`));
  meta.append(el('span', 'reader-dot', '·'));
  meta.append(el('span', undefined, formatDate(article.publishedAt || article.updatedAt)));
  meta.append(el('span', 'reader-dot', '·'));
  meta.append(el('span', undefined, `${article.views} 次阅读`));
  if (article.tags?.length) {
    const tags = el('span', 'reader-tags');
    for (const tag of article.tags) tags.append(el('span', 'post-tag', tag));
    meta.append(tags);
  }

  $('#article-body').innerHTML = renderMarkdown(article.content || '（这篇文章还没有正文。）');
  $('#article-source').textContent = `数据来源：${author?.username || 'unknown'} 的独立文章库`;
  $('#article-foot').hidden = false;
}

function renderError(message) {
  document.title = `文章打开失败 · ${siteTitle()}`;
  $('#article-kicker').textContent = 'Article';
  $('#article-title').textContent = '文章打开失败';
  $('#article-meta').replaceChildren();
  $('#article-body').replaceChildren(el('p', 'reader-error', message || '请稍后再试。'));
  $('#article-source').textContent = '可以回到文章列表，换一篇看看。';
  $('#article-foot').hidden = false;
}

async function boot() {
  renderLoading();

  const [siteResult] = await Promise.allSettled([getSite()]);
  if (siteResult.status === 'fulfilled') applySite(siteResult.value.site);

  const route = parseRoute();
  if (!route) {
    renderError('文章地址格式不正确，请从文章列表点进来。');
    return;
  }
  if (!/^\d+$/.test(route.id)) {
    renderError('文章链接不完整或格式不对。');
    return;
  }

  try {
    const data = await getArticle(route.username, route.id);
    renderArticle(data);
  } catch (error) {
    renderError(error.message || '文章读取失败，请稍后再试。');
  }
}

boot();
