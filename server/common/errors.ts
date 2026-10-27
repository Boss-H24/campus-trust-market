export class AppError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export function ensure(condition: unknown, status: number, code: string, message: string): asserts condition {
    if (!condition)
        throw new AppError(status, code, message);
}
export function text(value: unknown, name: string, min = 1, max = 200): string {
    ensure(typeof value === 'string', 400, 'INVALID_INPUT', `${name}格式错误`);
    const result = value.trim();
    ensure([...result].length >= min && [...result].length <= max, 400, 'INVALID_INPUT', `${name}长度应为${min}～${max}个字符`);
    return result;
}
export function id(value: unknown): string {
    ensure(typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value), 400, 'INVALID_INPUT', '编号格式错误');
    return value;
}
