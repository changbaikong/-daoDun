import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { HttpError, notFound } from './errors.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function decodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'BAD_PATH', '请求路径不合法');
  }
}

/**
 * 静态文件服务：托管 web/ 目录。
 * - 目录 / 无扩展名路径回退 index.html（方便以后加页面路由）；
 * - 带扩展名的资源找不到就 404；
 * - 防止 ../ 路径穿越。
 */
export async function serveStatic({ webDir, pathname, req, res }) {
  const decoded = decodePath(pathname).replace(/\/{2,}/g, '/');

  const candidates = [];
  if (decoded === '/' || decoded === '') {
    candidates.push('/index.html');
  } else {
    candidates.push(decoded);
    if (!path.extname(decoded)) {
      candidates.push(`${decoded}.html`);
      if (!decoded.startsWith('/assets/')) candidates.push('/index.html');
    }
  }

  for (const candidate of candidates) {
    const target = path.resolve(webDir, `.${candidate.startsWith('/') ? candidate : `/${candidate}`}`);
    if (target !== path.join(webDir, 'index.html') && !isInside(webDir, target)) {
      throw new HttpError(403, 'FORBIDDEN', '禁止访问该路径');
    }
    let stat;
    try {
      stat = await fsp.stat(target);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    await sendFile({ req, res, filePath: target, stat });
    return;
  }

  throw notFound('页面不存在');
}

async function sendFile({ req, res, filePath, stat }) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return;
  }

  const headers = {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=300',
    ETag: etag,
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);
  await pipeline(fs.createReadStream(filePath), res);
}
