import * as crypto from 'crypto';

export function verifyTelegramData(data: Record<string, any>, botToken: string): boolean {
    const secretKey = crypto.createHmac('sha256', botToken).digest();
    const hash = data.hash;
    delete data.hash;

    // Sắp xếp dữ liệu theo thứ tự ABC
    const sortedData = Object.keys(data)
        .sort()
        .map((key) => `${key}=${data[key]}`)
        .join('\n');

    // Tạo hash từ dữ liệu
    const computedHash = crypto
        .createHmac('sha256', secretKey)
        .update(sortedData)
        .digest('hex');

    return computedHash === hash;
}
