import { getArticle, getFeed, getSite, getStats } from './api.js';
import { renderMarkdown } from './markdown.js';

const FALLBACK_GREETINGS = [
  '欢迎回来，今天也一起写点什么吧～',
  '文章都好好地躺在各自的账号库里。',
  '有想写的东西，随时丢进账号库里。',
];

// 作者头像：账号库 avatar 字段有自定义地址就用它，否则用站点的默认头像。
const DEFAULT_AVATAR = '/assets/author-avatar.png';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 只有 JS 正常加载时才启用「渐入」动画，避免无 JS 时内容被隐藏。
document.documentElement.classList.add('js-reveal');

const state = {
  site: null,
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
  author.append(createAvatar(item.author, 'post-avatar post-avatar--img'));
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
    renderFeedState('还没有已发布的文章。运行 npm run seed 写入演示内容，或先写一篇。');
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
    const data = await getFeed(12);
    state.feedItems = data.items || [];
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
  meta.append(createAvatar(author, 'reader-avatar', 20));
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
  const permalink = el('a', 'reader-footer-link', '在独立页面打开 →');
  permalink.href = `/articles/${encodeURIComponent(author?.username || '')}/${encodeURIComponent(article.id)}`;
  footer.append(permalink);
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

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

let scrollJob = null;

function stopScrollJob() {
  if (!scrollJob) return;
  cancelAnimationFrame(scrollJob.raf);
  const finish = scrollJob.resolve;
  scrollJob = null;
  finish?.();
}

/**
 * 平滑滚动到目标位置。
 * - cancelable：用户自己滚轮 / 触摸时是否允许打断（锚点跳转允许，整屏切换期间锁住）
 * - ease：缓动曲线，默认 easeInOutCubic（起步、收尾都柔和）
 */
function animateScrollTo(targetY, { duration, cancelable = true, ease = easeInOutCubic } = {}) {
  stopScrollJob();
  const startY = window.scrollY;
  const distance = targetY - startY;

  if (prefersReducedMotion || Math.abs(distance) < 1) {
    window.scrollTo(0, targetY);
    return Promise.resolve();
  }

  const total = duration ?? Math.min(980, Math.max(520, Math.abs(distance) * 0.58));
  const startTime = performance.now();

  return new Promise((resolve) => {
    const job = { cancelable, resolve };
    const step = (now) => {
      const progress = Math.min(1, Math.max(0, (now - startTime) / total));
      window.scrollTo(0, startY + distance * ease(progress));
      if (progress < 1) {
        job.raf = requestAnimationFrame(step);
        return;
      }
      if (scrollJob === job) scrollJob = null;
      resolve();
    };
    scrollJob = job;
    job.raf = requestAnimationFrame(step);
  });
}

/** 第二屏（.content-stage）在文档里的起始位置。 */
function measureStageTop() {
  const stage = $('.content-stage');
  return stage ? Math.round(stage.getBoundingClientRect().top + window.scrollY) : 0;
}

/** 首屏 <-> 内容屏之间的一次整屏切换。 */
function switchScreen(direction) {
  holdSettleLock();
  animateScrollTo(direction > 0 ? measureStageTop() : 0, {
    duration: 720,
    cancelable: false,
    ease: easeInOutCubic,
  }).then(holdSettleLock);
}

/* 整屏切换结束后的短暂锁：把触控板惯性产生的余下滚轮事件吞掉，
   保证「一次手势 = 一次整屏切换」，不会切换完又滑出去一截。 */
let settleLock = false;
let settleTimer = null;

function holdSettleLock() {
  settleLock = true;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleLock = false;
  }, 220);
}

/** 顶部导航 / 按钮的锚点跳转，替代浏览器默认跳转。 */
function scrollToSection(target) {
  const topbar = $('.topbar');
  const offset = (topbar?.offsetHeight || 64) + 14;
  const targetY = Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset);
  // 长距离用稍长的时长，配合 easeInOutCubic 让起步和收尾都更柔和
  const distance = Math.abs(targetY - window.scrollY);
  animateScrollTo(targetY, {
    cancelable: true,
    ease: easeInOutCubic,
    duration: Math.min(900, Math.max(480, distance * 0.7)),
  });
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

  // 用户自己触摸滚动时，让锚点动画立即停下
  window.addEventListener(
    'touchstart',
    () => {
      if (scrollJob?.cancelable) stopScrollJob();
    },
    { passive: true },
  );
}

/**
 * 两屏之间的整屏切换：
 * - 鼠标滚轮：在首屏顶部向下、或在内容屏顶部向上时，累计一档滚轮后整屏切换；
 * - 键盘：PageDown / 空格（向下）、PageUp / Shift+空格（向上）；
 * - 触屏设备保持原生滚动，不做拦截。
 */
function initScreenTransition() {
  if (prefersReducedMotion) return;

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const pageKeys = new Set(['PageDown', 'PageUp', ' ']);
  const EDGE_TOLERANCE = 8;
  const TOP_ZONE = 24; // 内容屏顶部附近这一段用「累计一档」触发，避免轻轻一碰就翻
  let wheelAcc = 0;
  let wheelTimer = null;

  const resetWheelAcc = () => {
    wheelAcc = 0;
    clearTimeout(wheelTimer);
    wheelTimer = null;
  };

  const onWheel = (event) => {
    if (event.deltaY === 0 || document.body.classList.contains('is-locked')) return;

    // 整屏切换动画期间 / 惯性尾巴期间锁住滚轮，避免多个动画互相抢滚动位置
    if (settleLock) {
      holdSettleLock();
      event.preventDefault();
      return;
    }

    if (scrollJob) {
      if (!scrollJob.cancelable) {
        event.preventDefault();
        return;
      }
      stopScrollJob();
    }

    if (!finePointer) return;

    const y = window.scrollY;
    const stageTop = measureStageTop();
    const delta =
      event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);

    // 首屏顶部向下：累计一档后整屏切到内容屏
    if (delta > 0 && y <= EDGE_TOLERANCE) {
      event.preventDefault();
      wheelAcc += delta;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(resetWheelAcc, 180);
      if (wheelAcc >= 60) {
        resetWheelAcc();
        switchScreen(1);
      }
      return;
    }

    // 内容屏顶部向上：同样累计一档后整屏切回首屏
    if (delta < 0 && y >= stageTop && y <= stageTop + TOP_ZONE) {
      event.preventDefault();
      wheelAcc += delta;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(resetWheelAcc, 180);
      if (wheelAcc <= -60) {
        resetWheelAcc();
        switchScreen(-1);
      }
      return;
    }

    // 内容屏内一次滚动就会越过内容屏顶部时：直接整屏切回首屏
    if (delta < 0 && y > stageTop + TOP_ZONE && y + delta < stageTop) {
      event.preventDefault();
      resetWheelAcc();
      switchScreen(-1);
      return;
    }

    resetWheelAcc();
  };

  window.addEventListener('wheel', onWheel, { passive: false });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.body.classList.contains('is-locked')) return;
    const active = document.activeElement;
    if (active?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName || '')) return;

    // 整屏切换动画 / 惯性尾巴期间，锁住整屏滚动键
    if ((scrollJob && !scrollJob.cancelable) || settleLock) {
      if (pageKeys.has(event.key)) event.preventDefault();
      return;
    }

    const y = window.scrollY;
    const stageTop = measureStageTop();
    const pageStep = window.innerHeight * 0.87;
    const forward = event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey);
    const back = event.key === 'PageUp' || (event.key === ' ' && event.shiftKey);

    if (forward) {
      // 只有首屏顶部才拦截向下翻页；内容屏内保持原生翻页
      if (y <= EDGE_TOLERANCE) {
        event.preventDefault();
        switchScreen(1);
      }
    } else if (back) {
      // 内容屏内向上翻一页会越过内容屏顶部时，整屏切回首屏
      if (y >= stageTop && y - pageStep < stageTop) {
        event.preventDefault();
        switchScreen(-1);
      }
    }
  });
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

/** 首屏滚出视口时：标题区淡出、上浮、轻微缩小，背景压暗，让两屏衔接更自然。 */
function initHeroScroll() {
  if (prefersReducedMotion) return;
  const hero = $('.hero');
  const copy = $('.hero-copy');
  const hint = $('.scroll-hint');
  const veil = $('.scene-veil');
  if (!hero || !copy) return;

  let ticking = false;
  const update = () => {
    ticking = false;
    const rect = hero.getBoundingClientRect();
    const height = Math.max(rect.height, 1);
    const raw = clamp01(-rect.top / (height * 0.8));
    const eased = raw * raw * (3 - 2 * raw); // smoothstep：起止更柔，中段更有推进感

    copy.style.opacity = String(clamp01(1 - eased));
    copy.style.transform = `translate3d(0, ${(-eased * 44).toFixed(2)}px, 0) scale(${(
      1 - eased * 0.016
    ).toFixed(4)})`;
    if (hint) hint.style.opacity = String(clamp01(1 - raw * 2.4));
    if (veil) veil.style.opacity = String(clamp01(eased * 0.65));
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
  initScreenTransition();
  initReveal();
  initHeroScroll();

  const [siteResult, statsResult] = await Promise.allSettled([getSite(), getStats()]);

  if (siteResult.status === 'fulfilled') {
    applySite(siteResult.value.site);
  } else {
    toast('站点信息读取失败，已使用默认文案');
  }
  startGreeting();

  if (statsResult.status === 'fulfilled') renderStats(statsResult.value);

  await loadFeed();
  openArticleFromUrl();
}

boot();
