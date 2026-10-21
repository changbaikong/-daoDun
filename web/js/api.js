/** 极简 API 客户端：统一处理 JSON 与错误提示。 */

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    ...options,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || `请求失败（HTTP ${response.status}）`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    throw error;
  }

  return payload;
}

export function getSite() {
  return request('/api/site');
}

export function getStats() {
  return request('/api/stats');
}

export function getFeed(limit = 8) {
  return request(`/api/feed?limit=${encodeURIComponent(limit)}`);
}

export function getAccounts() {
  return request('/api/accounts');
}

export function getAccountArticles(username, { limit = 12, offset = 0 } = {}) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request(`/api/accounts/${encodeURIComponent(username)}/articles?${query}`);
}

export function getArticle(username, articleId) {
  return request(`/api/public/articles/${encodeURIComponent(username)}/${encodeURIComponent(articleId)}`);
}
