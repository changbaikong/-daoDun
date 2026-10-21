import { getAccountArticles, getAccounts, getFeed, getSite } from './api.js';

/**
 * 第二页：文章列表页。
 * - 跨账号 Feed + 按账号筛选；
 * - 分页（「加载更多」），筛选条件写进 ?account= 方便分享；
 * - 每张卡片都是指向独立文章页 /articles/<账号>/<id> 的链接。
 */
const PAGE_SIZE = 12;

const state = {
  site: null,
  accounts: [],
  activeAccount: '',
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

function initialOf(name) {
  const text = String(name || '?').trim();
  return text ? text.slice(0, 1).toUpperCase() : '?';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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

function accountLabel(account) {
  return account?.nickname || account?.username || '';
}

/* ------------------------------------------------------------------ */
/* 站点信息                                                            */
/* ------------------------------------------------------------------ */

function updateDocumentTitle() {
  const siteTitle = state.site?.title || '刀盾的小屋';
  const account = state.accounts.find((item) => item.username === state.activeAccount);
  document.title = account ? `${accountLabel(account)} 的文章 · ${siteTitle}` : `文章 · ${siteTitle}`;
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
/* 账号筛选                                                            */
/* ------------------------------------------------------------------ */

function renderFilters() {
  const bar = $('#filter-bar');
  if (!bar) return;
  bar.replaceChildren();

  const all = el('button', 'filter-chip is-active', '全部账号');
  all.type = 'button';
  all.dataset.account = '';
  bar.append(all);

  for (const account of state.accounts) {
    const chip = el('button', 'filter-chip', accountLabel(account));
    chip.type = 'button';
    chip.dataset.account = account.username;
    bar.append(chip);
  }
}

function syncFilterState() {
  for (const chip of $$('#filter-bar .filter-chip')) {
    chip.classList.toggle('is-active', chip.dataset.account === state.activeAccount);
  }
}

function updateUrl() {
  const url = new URL(window.location.href);
  if (state.activeAccount) url.searchParams.set('account', state.activeAccount);
  else url.searchParams.delete('account');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function selectAccount(username) {
  const next = username || '';
  if (next === state.activeAccount) return;
  state.activeAccount = next;
  syncFilterState();
  updateUrl();
  updateDocumentTitle();
  loadPosts({ reset: true });
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
  author.append(el('span', 'post-avatar', initialOf(item.author?.nickname)));
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
  const account = state.accounts.find((item) => item.username === state.activeAccount);
  if (account) {
    note.textContent = `@${account.username} · ${state.total} 篇已发布`;
  } else {
    const authors = state.accounts.length;
    note.textContent = `共 ${state.total} 篇已发布 · ${authors} 位作者 · 按发布时间排序`;
  }
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
    const data = state.activeAccount
      ? await getAccountArticles(state.activeAccount, { limit: PAGE_SIZE, offset: state.offset })
      : await getFeed(PAGE_SIZE, state.offset);
    const items = data.items || [];
    state.total = typeof data.total === 'number' ? data.total : items.length;
    state.offset += items.length;
    state.items.push(...items);

    if (reset && list) list.replaceChildren();
    if (state.items.length === 0) {
      renderListState(
        state.activeAccount
          ? `${accountLabel(
              state.accounts.find((item) => item.username === state.activeAccount),
            )} 的文章库里还没有已发布文章。`
          : '还没有已发布的文章。运行 npm run seed 写入演示内容，或先往账号库里存一篇。',
      );
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
  $('#filter-bar')?.addEventListener('click', (event) => {
    const chip = event.target.closest('.filter-chip');
    if (!chip) return;
    selectAccount(chip.dataset.account || '');
  });

  $('#load-more')?.addEventListener('click', () => loadPosts());

  $('#post-list')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-posts]')) loadPosts({ reset: true });
  });
}

function readAccountFromUrl() {
  const raw = new URLSearchParams(window.location.search).get('account') || '';
  if (!raw) return '';
  return state.accounts.some((account) => account.username === raw) ? raw : '';
}

async function boot() {
  wireEvents();

  const [siteResult, accountsResult] = await Promise.allSettled([getSite(), getAccounts()]);

  if (siteResult.status === 'fulfilled') {
    applySite(siteResult.value.site);
  } else {
    toast('站点信息读取失败，已使用默认文案');
  }

  if (accountsResult.status === 'fulfilled') {
    state.accounts = accountsResult.value.items || [];
    state.activeAccount = readAccountFromUrl();
    renderFilters();
    syncFilterState();
    updateDocumentTitle();
  } else {
    toast('账号数据读取失败');
  }

  await loadPosts({ reset: true });
}

boot();
