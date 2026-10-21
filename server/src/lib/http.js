import { HttpError, payloadTooLarge } from './errors.js';

const BODY_LIMIT = 1024 * 1024;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把 /api/articles/:id 这样的模板编译成正则 + 参数名列表。 */
function compilePattern(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':') && segment.length > 1) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return escapeRegExp(segment);
    })
    .join('/');
  return { pattern, regex: new RegExp(`^${source}/?$`), keys };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 极简路由表（无第三方依赖）。 */
export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    this.routes.push({ method: method.toUpperCase(), handler, ...compilePattern(pattern) });
    return this;
  }

  get(pattern, handler) {
    return this.add('GET', pattern, handler);
  }

  post(pattern, handler) {
    return this.add('POST', pattern, handler);
  }

  patch(pattern, handler) {
    return this.add('PATCH', pattern, handler);
  }

  put(pattern, handler) {
    return this.add('PUT', pattern, handler);
  }

  delete(pattern, handler) {
    return this.add('DELETE', pattern, handler);
  }

  /**
   * @param {string} method
   * @param {string} pathname
   * @returns {{ route: { handler: Function, method: string, pattern: string } | null, params: Record<string, string>, allowed: string[] } | null}
   */
  match(method, pathname) {
    const target = method.toUpperCase();
    const allowed = new Set();
    for (const route of this.routes) {
      const found = route.regex.exec(pathname);
      if (!found) continue;
      allowed.add(route.method);
      if (route.method !== target) continue;
      const params = {};
      route.keys.forEach((key, index) => {
        params[key] = safeDecode(found[index + 1]);
      });
      return { route, params, allowed: [...allowed] };
    }
    return allowed.size > 0 ? { route: null, params: {}, allowed: [...allowed] } : null;
  }
}

/** 请求上下文：路由处理函数通过它读参数、写响应元信息。 */
export class Context {
  constructor({ req, res, url, params }) {
    this.req = req;
    this.res = res;
    this.url = url;
    this.query = url.searchParams;
    this.params = params;
    this.body = {};
    this.status = 200;
  }

  setStatus(status) {
    this.status = status;
    return this;
  }

  setHeader(name, value) {
    this.res.setHeader(name, value);
    return this;
  }
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data ?? {});
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/**
 * 读取并解析 JSON 请求体（限制 1MB）。
 * @param {import('node:http').IncomingMessage} req
 */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.includes('application/json')) {
      reject(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求体需要是 application/json'));
      return;
    }

    const declared = Number(req.headers['content-length'] || 0);
    if (declared > BODY_LIMIT) {
      reject(payloadTooLarge());
      return;
    }

    const chunks = [];
    let size = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        settled = true;
        reject(payloadTooLarge());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
        resolve(data);
      } catch {
        reject(new HttpError(400, 'INVALID_JSON', '请求 JSON 格式不正确'));
      }
    });

    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}
