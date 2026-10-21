import {
  getAccountArticles,
  getAccounts,
  getArticle,
  getFeed,
  getSite,
  getStats,
} from './api.js';
import { renderMarkdown } from './markdown.js';

const FALLBACK_GREETINGS = [
  '欢迎回来，今天也一起写点什么吧～',
  '文章都好好地躺在各自的账号库里。',
  '有想写的东西，随时丢进账号库里。',
];

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 只有 JS 正常加载时才启用「渐入」动画，避免无 JS 时内容被隐藏。
document.documentElement.classList.add('js-reveal');

const state = {
  site: null,
  accounts: [],
  activeAccount: '',
  feedItems: [],
  greetingLines: [],
  greetingIndex: 0,
  greetingTimer: null,
  typingTimer: null,
  readerReturnFocus: null,
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

function animateNumber(node, target) {
  if (!node) return;
  const value = Number(target) || 0;
  if (prefersReducedMotion) {
    node.textContent = String(value);
    return;
  }
  const duration = 640;
  const start = performance.now();
  const from = 0;
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    node.textContent = String(Math.round(from + (value - from) * eased));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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

/* ------------------------------------------------------------------ */
/* 站点信息 / 数据统计                                                  */
/* ------------------------------------------------------------------ */

function applySite(site) {
  if (!site) return;
  state.site = site;
  for (const node of $$('[data-site]')) {
    const value = site[node.dataset.site];
    if (value) node.textContent = value;
  }
  if (site.title) document.title = `${site.title} · 看板娘起始页`;
}

function renderStats(stats) {
  if (!stats) return;
  animateNumber($('#stat-accounts'), stats.accounts);
  animateNumber($('#stat-articles'), stats.articles);
  animateNumber($('#stat-published'), stats.published);
}

function startGreeting() {
  const line = $('#hero-greeting');
  if (!line) return;
  const siteLine = state.site?.mascotLine;
  state.greetingLines = [siteLine, ...FALLBACK_GREETINGS.filter((item) => item && item !== siteLine)].filter(Boolean);
  state.greetingIndex = 0;

  const play = () => {
    const text = state.greetingLines[state.greetingIndex % state.greetingLines.length];
    state.greetingIndex += 1;
    typeText(line, text);
  };

  play();
  if (!prefersReducedMotion) {
    clearInterval(state.greetingTimer);
    state.greetingTimer = setInterval(play, 9000);
  }
}

function typeText(node, text) {
  clearInterval(state.typingTimer);
  if (prefersReducedMotion) {
    node.textContent = text;
    return;
  }
  let index = 0;
  node.textContent = '';
  state.typingTimer = setInterval(() => {
    index += 1;
    node.textContent = text.slice(0, index);
    if (index >= text.length) clearInterval(state.typingTimer);
  }, 55);
}

/* ------------------------------------------------------------------ */
/* 账号筛选 + 作者卡片                                                  */
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
    const chip = el('button', 'filter-chip', account.nickname || account.username);
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

function selectAccount(username) {
  state.activeAccount = username || '';
  syncFilterState();
  loadFeed();
}

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

function renderFeedState(message, { retry = false } = {}) {
  const list = $('#feed-list');
  if (!list) return;
  list.replaceChildren();
  const wrapper = el('div', 'feed-state-card');
  wrapper.append(el('p', 'feed-state-title', message));
  if (retry) {
    const button = el('button', 'btn btn-ghost btn-sm', '重试');
    button.type = 'button';
    button.dataset.retryFeed = '1';
    wrapper.append(button);
  }
  list.append(wrapper);
}

function createPostCard(item) {
  const card = el('article', 'post-card');
  card.dataset.username = item.author?.username || '';
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
  const summary = el('p', 'post-card-summary', item.summary || item.excerpt || '这篇文章还没有摘要。');

  const foot = el('div', 'post-card-foot');
  const author = el('span', 'post-author');
  author.append(el('span', 'post-avatar', initialOf(item.author?.nickname)));
  author.append(el('span', 'post-author-name', item.author?.nickname || item.author?.username || '匿名'));
  const open = el('button', 'post-open', '阅读全文 →');
  open.type = 'button';
  foot.append(author, open);

  card.append(head, title, summary, foot);
  return card;
}

function renderFeed() {
  const list = $('#feed-list');
  if (!list) return;
  list.replaceChildren();

  if (state.feedItems.length === 0) {
    const account = state.accounts.find((item) => item.username === state.activeAccount);
    renderFeedState(
      account
        ? `${account.nickname || account.username} 的文章库里还没有已发布文章。`
        : '还没有已发布的文章。运行 npm run seed 写入演示内容，或先往账号库里存一篇。',
    );
    return;
  }

  for (const item of state.feedItems) {
    list.append(createPostCard(item));
  }
}

async function loadFeed() {
  const list = $('#feed-list');
  if (!list) return;
  list.replaceChildren(el('p', 'feed-state', '正在读取文章库…'));

  try {
    if (state.activeAccount) {
      const data = await getAccountArticles(state.activeAccount, { limit: 12 });
      state.feedItems = data.items || [];
    } else {
      const data = await getFeed(12);
      state.feedItems = data.items || [];
    }
    renderFeed();
  } catch (error) {
    renderFeedState(error.message || '文章读取失败', { retry: true });
  }
}

/* ------------------------------------------------------------------ */
/* 阅读弹窗                                                            */
/* ------------------------------------------------------------------ */

function openReaderShell() {
  const reader = $('#reader');
  if (!reader) return;
  state.readerReturnFocus = document.activeElement;
  reader.hidden = false;
  document.body.classList.add('is-locked');
  requestAnimationFrame(() => reader.classList.add('is-open'));
  $('#reader .reader-close')?.focus();
}

function closeReader() {
  const reader = $('#reader');
  if (!reader || reader.hidden) return;
  reader.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  setTimeout(() => {
    reader.hidden = true;
  }, 200);
  if (new URLSearchParams(window.location.search).has('post')) {
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
  if (state.readerReturnFocus instanceof HTMLElement) state.readerReturnFocus.focus();
}

function showReaderLoading() {
  $('#reader-title').textContent = '正在打开文章…';
  $('#reader-kicker').textContent = 'Article';
  $('#reader-meta').textContent = '';
  $('#reader-body').replaceChildren(el('p', 'reader-loading', '正在从账号库里取回文章…'));
}

function fillReader({ article, author }) {
  $('#reader-kicker').textContent = author?.nickname || author?.username || 'Article';
  $('#reader-title').textContent = article.title;
  const meta = $('#reader-meta');
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

  const body = $('#reader-body');
  body.innerHTML = renderMarkdown(article.content || '（这篇文章还没有正文。）');

  const footer = el('div', 'reader-footer');
  footer.append(el('span', 'reader-footer-note', `数据来源：${author?.username || 'unknown'} 的独立文章库`));
  body.append(footer);
}

async function openArticle(username, articleId) {
  if (!username || !articleId) return;
  openReaderShell();
  showReaderLoading();
  try {
    const data = await getArticle(username, articleId);
    fillReader(data);
    history.replaceState(
      null,
      '',
      `${window.location.pathname}?post=${encodeURIComponent(username)}:${encodeURIComponent(articleId)}`,
    );
  } catch (error) {
    $('#reader-title').textContent = '文章打开失败';
    $('#reader-meta').textContent = '';
    $('#reader-body').replaceChildren(el('p', 'reader-error', error.message || '请稍后再试。'));
  }
}

/** 支持形如 /?post=xiaoxing:1 的文章深链。 */
function openArticleFromUrl() {
  const raw = new URLSearchParams(window.location.search).get('post');
  if (!raw) return;
  const match = /^([a-z][a-z0-9_]{1,23}):(\d+)$/.exec(raw);
  if (!match) return;
  openArticle(match[1], match[2]);
}

/* ------------------------------------------------------------------ */
/* 滚动过渡                                                            */
/* ------------------------------------------------------------------ */

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** 带缓动的平滑滚动，替代浏览器默认的锚点跳转。 */
function scrollToSection(target) {
  const topbar = $('.topbar');
  const offset = (topbar?.offsetHeight || 64) + 14;
  const targetY = Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset);

  if (prefersReducedMotion) {
    window.scrollTo(0, targetY);
    return;
  }

  const startY = window.scrollY;
  const distance = targetY - startY;
  if (Math.abs(distance) < 2) return;

  const duration = Math.min(1100, Math.max(520, Math.abs(distance) * 0.5));
  const startTime = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    window.scrollTo(0, startY + distance * easeInOutCubic(progress));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initSmoothAnchors() {
  for (const link of $$('a[href^="#"]')) {
    if (link.classList.contains('skip-link')) continue;
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      const target = document.querySelector(hash);
      if (!target) return;
      event.preventDefault();
      scrollToSection(target);
    });
  }
}

/** 第二屏元素首次进入视口时渐入。 */
function initReveal() {
  const items = $$('[data-reveal]');
  if (items.length === 0) return;

  if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
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
    { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
  );
  for (const item of items) observer.observe(item);
}

/** 向下滚动时首屏内容轻微上移并淡出，让两屏衔接更自然。 */
function initHeroScroll() {
  if (prefersReducedMotion) return;
  const hero = $('.hero');
  const copy = $('.hero-copy');
  const hint = $('.scroll-hint');
  if (!hero || !copy) return;

  let ticking = false;
  const update = () => {
    ticking = false;
    const rect = hero.getBoundingClientRect();
    const distance = Math.max(rect.height * 0.7, 1);
    const progress = Math.min(1, Math.max(0, -rect.top / distance));
    copy.style.opacity = String(1 - progress * 0.9);
    copy.style.transform = `translate3d(0, ${(-progress * 28).toFixed(2)}px, 0)`;
    if (hint) hint.style.opacity = String(Math.max(0, 1 - progress * 2.2));
  };

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  update();
}

/* ------------------------------------------------------------------ */
/* 事件绑定                                                            */
/* ------------------------------------------------------------------ */

function wireEvents() {
  $('#filter-bar')?.addEventListener('click', (event) => {
    const chip = event.target.closest('.filter-chip');
    if (!chip) return;
    selectAccount(chip.dataset.account || '');
  });

  $('#feed-list')?.addEventListener('click', (event) => {
    const retry = event.target.closest('[data-retry-feed]');
    if (retry) {
      loadFeed();
      return;
    }
    const card = event.target.closest('.post-card');
    if (!card) return;
    openArticle(card.dataset.username, card.dataset.articleId);
  });

  for (const closeButton of $$('[data-close="reader"]')) {
    closeButton.addEventListener('click', closeReader);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeReader();
  });
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  wireEvents();
  initSmoothAnchors();
  initReveal();
  initHeroScroll();

  const [siteResult, statsResult, accountsResult] = await Promise.allSettled([
    getSite(),
    getStats(),
    getAccounts(),
  ]);

  if (siteResult.status === 'fulfilled') {
    applySite(siteResult.value.site);
  } else {
    toast('站点信息读取失败，已使用默认文案');
  }
  startGreeting();

  if (statsResult.status === 'fulfilled') renderStats(statsResult.value);
  if (accountsResult.status === 'fulfilled') {
    state.accounts = accountsResult.value.items || [];
    renderFilters();
  } else {
    toast('账号数据读取失败');
  }

  await loadFeed();
  openArticleFromUrl();
}

boot();
