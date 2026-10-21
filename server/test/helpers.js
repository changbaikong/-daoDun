import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

/** 为单个测试创建一个临时数据目录的 app。 */
export function createTestApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jk-blog-test-'));
  const app = createApp({ dataDir });
  return {
    app,
    dataDir,
    cleanup() {
      try {
        app.close();
      } catch {
        // 已关闭则忽略
      }
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        // Windows 上文件句柄释放略慢时忽略
      }
    },
  };
}

/** 在随机端口起一个真实 HTTP 服务，用于接口测试。 */
export async function startTestServer(app) {
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    server,
    baseUrl,
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function fetchJson(baseUrl, pathname, init) {
  const res = await fetch(`${baseUrl}${pathname}`, init);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { res, data, text };
}
