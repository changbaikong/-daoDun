import { getFeed, getSite } from './api.js';

/**
 * 第二页：文章列表页。
 * - 所有已发布文章按时间排序（暂时不按账号筛选/分组）；
 * - 分页（「加载更多」）；
 * - 每张卡片都是指向独立文章页 /articles/<账号>/<id> 的链接。
 */
const PAGE_SIZE = 12;

// 作者头像：账号库 avatar 字段有自定义地址就用它，否则用站点的默认头像。
const DEFAULT_AVATAR = '/assets/author-avatar.png';

// 只有 JS 正常加载时才启用「渐入」动画，避免无 JS 时内容被隐藏。
document.documentElement.classList.add('js-reveal');

const state = {
  site: null,
  items: [],
  total: 0,
  offset: 0,
  loading: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

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

/** 生成一个小圆形作者头像；account.avatar 为空时用默认头像。 */
function createAvatar(author, className, size = 26) {
  const avatar = el('img', className);
  avatar.src = author?.avatar || DEFAULT_AVATAR;
  avatar.alt = '';
  avatar.width = size;
  avatar.height = size;
  avatar.loading = 'lazy';
  avatar.decoding = 'async';
  return avatar;
}

let toastTimer = null;
function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => {
      node.hidden = true;
    }, 220);
  }, 3200);
}

/** 图下文章区第一次进入视口时渐入，避免从横图直接切到列表太突兀。 */
function initReveal() {
  const items = $$('[data-reveal]');
  if (items.length === 0) return;

  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    typeof IntersectionObserver === 'undefined'
  ) {
    for (const item of items) item.classList.add('is-revealed');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -4% 0px' },
  );
  for (const item of items) observer.observe(item);
}

/* ------------------------------------------------------------------ */
/* 站点信息                                                            */
/* ------------------------------------------------------------------ */

function updateDocumentTitle() {
  document.title = `文章 · ${state.site?.title || '刀盾的小屋'}`;
}

function applySite(site) {
  if (!site) return;
  state.site = site;
  for (const node of $$('[data-site]')) {
    const value = site[node.dataset.site];
    if (value) node.textContent = value;
  }
  updateDocumentTitle();
}

/* ------------------------------------------------------------------ */
/* 文章卡片 / 列表状态                                                  */
/* ------------------------------------------------------------------ */

function createPostCard(item) {
  const username = item.author?.username || '';
  const card = el('a', 'post-card post-card--link');
  card.href = `/articles/${encodeURIComponent(username)}/${encodeURIComponent(item.id)}`;
  card.dataset.username = username;
  card.dataset.articleId = String(item.id);

  const head = el('div', 'post-card-head');
  if (item.tags?.length) {
    const tagList = el('div', 'post-tags');
    for (const tag of item.tags.slice(0, 3)) {
      tagList.append(el('span', 'post-tag', tag));
    }
    head.append(tagList);
  }
  head.append(el('span', 'post-date', formatDate(item.publishedAt)));

  const title = el('h3', 'post-card-title', item.title);
  const summary = el(
    'p',
    'post-card-summary',
    item.summary || item.excerpt || '这篇文章还没有摘要。',
  );

  const foot = el('div', 'post-card-foot');
  const author = el('span', 'post-author');
  author.append(createAvatar(item.author, 'post-avatar post-avatar--img'));
  author.append(el('span', 'post-author-name', item.author?.nickname || username || '匿名'));
  const open = el('span', 'post-open post-open--static', '阅读全文 →');
  foot.append(author, open);

  card.append(head, title, summary, foot);
  return card;
}

function renderListState(message, { retry = false } = {}) {
  const list = $('#post-list');
  if (!list) return;
  const wrapper = el('div', 'feed-state-card');
  wrapper.append(el('p', 'feed-state-title', message));
  if (retry) {
    const button = el('button', 'btn btn-ghost btn-sm', '重试');
    button.type = 'button';
    button.dataset.retryPosts = '1';
    wrapper.append(button);
  }
  list.replaceChildren(wrapper);
}

function updatePageNote(loadingText) {
  const note = $('#page-note');
  if (!note) return;
  if (loadingText) {
    note.textContent = loadingText;
    return;
  }
  note.textContent = `共 ${state.total} 篇已发布 · 按发布时间排序`;
}

function syncMore() {
  const wrap = $('#library-more');
  const button = $('#load-more');
  if (!wrap || !button) return;
  wrap.hidden = !(state.offset < state.total);
  button.disabled = state.loading;
  button.textContent = state.loading ? '正在加载…' : '加载更多';
}

/* ------------------------------------------------------------------ */
/* 读取                                                                */
/* ------------------------------------------------------------------ */

async function loadPosts({ reset = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const list = $('#post-list');

  if (reset) {
    state.items = [];
    state.total = 0;
    state.offset = 0;
    if (list) list.replaceChildren(el('p', 'feed-state', '正在读取文章库…'));
    updatePageNote('正在读取文章库…');
  }
  syncMore();

  try {
    const data = await getFeed(PAGE_SIZE, state.offset);
    const items = data.items || [];
    state.total = typeof data.total === 'number' ? data.total : items.length;
    state.offset += items.length;
    state.items.push(...items);

    if (reset && list) list.replaceChildren();
    if (state.items.length === 0) {
      renderListState('还没有已发布的文章。运行 npm run seed 写入演示内容，或先写一篇。');
    } else if (list) {
      for (const item of items) list.append(createPostCard(item));
    }
    updatePageNote();
  } catch (error) {
    if (reset) {
      state.items = [];
      state.total = 0;
      state.offset = 0;
      renderListState(error.message || '文章读取失败', { retry: true });
      updatePageNote('文章读取失败');
    } else {
      toast(error.message || '加载更多失败');
    }
  } finally {
    state.loading = false;
    syncMore();
  }
}

/* ------------------------------------------------------------------ */
/* 事件与启动                                                          */
/* ------------------------------------------------------------------ */

function wireEvents() {
  $('#load-more')?.addEventListener('click', () => loadPosts());

  $('#post-list')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-posts]')) loadPosts({ reset: true });
  });
}

async function boot() {
  wireEvents();
  initReveal();

  const [siteResult] = await Promise.allSettled([getSite()]);

  if (siteResult.status === 'fulfilled') {
    applySite(siteResult.value.site);
  } else {
    toast('站点信息读取失败，已使用默认文案');
  }

  await loadPosts({ reset: true });
}

boot();
