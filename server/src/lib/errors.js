/**
 * 带 HTTP 状态码的业务错误。
 * 路由层抛出后由 server.js 统一转成 { error: { code, message, details } }。
 */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {Record<string, string>} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);
export const validationError = (details, message = '请检查输入内容') =>
  new HttpError(422, 'VALIDATION_ERROR', message, details);
export const notFound = (message = '资源不存在') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message = '资源已存在') => new HttpError(409, 'CONFLICT', message);
export const payloadTooLarge = (message = '请求内容过大') => new HttpError(413, 'PAYLOAD_TOO_LARGE', message);
