import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');

/**
 * 读取运行配置，全部支持环境变量覆盖。
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  return {
    rootDir,
    webDir: path.join(rootDir, 'web'),
    dataDir: env.BLOG_DATA_DIR ? path.resolve(env.BLOG_DATA_DIR) : path.join(rootDir, 'data'),
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 4173),
  };
}
