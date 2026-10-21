import { HttpError } from './lib/errors.js';
import { Context, readJsonBody, sendJson } from './lib/http.js';
import { serveStatic } from './lib/static.js';

const SAFE_METHODS = new Set(['GET', 'HEAD']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * 组装 Node.js 的 request handler：/api/* 走路由，其余走 web/ 静态文件。
 * @param {{ config: ReturnType<import('./config.js').loadConfig>, router: import('./lib/http.js').Router }} options
 */
export function createRequestHandler({ config, router }) {
  return async function handler(req, res) {
    applySecurityHeaders(res);

    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: '请求地址不合法' } });
      return;
    }

    try {
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        await handleApi({ req, res, url, router });
        return;
      }
      if (!SAFE_METHODS.has(req.method || 'GET')) {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的请求方法');
      }
      await serveStatic({ webDir: config.webDir, pathname: url.pathname, req, res });
    } catch (error) {
      respondError(res, error);
    }
  };
}

async function handleApi({ req, res, url, router }) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      Allow: 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const matched = router.match(req.method || 'GET', url.pathname);
  if (!matched) throw new HttpError(404, 'NOT_FOUND', '接口不存在');
  if (!matched.route) {
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的请求方法', {
      allowed: matched.allowed.join(', '),
    });
  }

  const ctx = new Context({ req, res, url, params: matched.params });
  if (hasRequestBody(req)) {
    ctx.body = await readJsonBody(req);
  }

  const result = await matched.route.handler(ctx);
  if (res.writableEnded) return;
  sendJson(res, ctx.status, result === undefined ? { ok: true } : result);
}

function hasRequestBody(req) {
  if (!BODY_METHODS.has(req.method || 'GET')) return false;
  if (Number(req.headers['content-length'] || 0) > 0) return true;
  return Boolean(req.headers['transfer-encoding']);
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; form-action 'self'",
  );
}

function respondError(res, error) {
  if (res.headersSent || res.writableEnded) {
    if (!res.writableEnded) res.end();
    return;
  }
  if (error instanceof HttpError) {
    sendJson(res, error.status, {
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  console.error('[blog] 未处理的错误:', error);
  sendJson(res, 500, {
    error: { code: 'INTERNAL_ERROR', message: '服务器开小差了，请稍后再试' },
  });
}
