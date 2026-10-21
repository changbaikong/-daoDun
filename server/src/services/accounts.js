import { conflict, notFound, validationError } from '../lib/errors.js';
import { readString } from '../lib/validate.js';
import { isUniqueViolation } from '../db/sqlite.js';

/** 账号名规则：小写字母开头，2-24 位字母/数字/下划线。 */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{1,23}$/;

/**
 * 账号服务：创建账号时同步创建它专属的文章库。
 * 当前阶段没有登录，账号是「文章分库」的归属维度，由站长通过种子脚本/程序创建。
 */
export class AccountService {
  /** @param {ReturnType<import('../db/index.js').openBlogDatabase>} db */
  constructor(db) {
    this.db = db;
  }

  /**
   * @param {{ username: string, nickname?: string, bio?: string, avatar?: string }} input
   */
  create(input) {
    const username = readString(input, 'username', {
      required: true,
      label: '账号',
      min: 2,
      max: 24,
    }).toLowerCase();

    if (!USERNAME_PATTERN.test(username)) {
      throw validationError({
        username: '账号需以小写字母开头，2-24 位，仅限字母、数字与下划线',
      });
    }

    const nickname = readString(input, 'nickname', { label: '昵称', max: 32 }) || username;
    const bio = readString(input, 'bio', { label: '简介', max: 200 }) || '';
    const avatar = readString(input, 'avatar', { label: '头像', max: 300 }) || '';

    if (this.db.master.accounts.findByUsername(username)) {
      throw conflict('这个账号已经存在了');
    }

    let account;
    try {
      account = this.db.master.accounts.create({ username, nickname, bio, avatar });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('这个账号已经存在了');
      throw error;
    }

    // 账号创建成功后再建文章库；失败则回滚账号记录，保持主库干净。
    try {
      this.db.accountDbs.open(account.id);
    } catch (error) {
      this.db.master.accounts.remove(account.id);
      throw error;
    }

    return account;
  }

  list() {
    return this.db.master.accounts.list();
  }

  /** @param {number} id */
  getById(id) {
    const account = this.db.master.accounts.findById(id);
    if (!account) throw notFound('账号不存在');
    return account;
  }

  /** @param {string} username */
  getByUsername(username) {
    const account = this.db.master.accounts.findByUsername(String(username || '').toLowerCase());
    if (!account) throw notFound('账号不存在');
    const repo = this.db.accountDbs.get(account.id).articles;
    return {
      ...account,
      stats: {
        articles: repo.count(),
        published: repo.count({ status: 'published' }),
      },
    };
  }

  /**
   * @param {number} id
   * @param {{ nickname?: string, bio?: string, avatar?: string }} input
   */
  updateProfile(id, input) {
    this.getById(id);
    const patch = {};
    const nickname = readString(input, 'nickname', { label: '昵称', max: 32 });
    const bio = readString(input, 'bio', { label: '简介', max: 200 });
    const avatar = readString(input, 'avatar', { label: '头像', max: 300 });
    if (nickname !== undefined && nickname.length > 0) patch.nickname = nickname;
    if (bio !== undefined) patch.bio = bio;
    if (avatar !== undefined) patch.avatar = avatar;
    return this.db.master.accounts.updateProfile(id, patch);
  }

  /** 删除账号：连同它的文章库文件一起删除。 */
  remove(id) {
    const account = this.getById(id);
    this.db.accountDbs.drop(id);
    this.db.master.accounts.remove(id);
    return account;
  }
}
