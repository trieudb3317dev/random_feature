import * as bs58 from 'bs58';

/**
 * Trích xuất Solana private key từ nhiều định dạng khác nhau
 * @param privateKey Private key có thể ở dạng JSON string hoặc base58 string
 * @returns Solana private key ở dạng base58 string
 */
export function extractSolanaPrivateKey(privateKey: string): string {
    let solanaKey = privateKey;

    // Thử parse JSON
    try {
        const parsedKey = JSON.parse(privateKey);
        if (parsedKey && parsedKey.solana) {
            solanaKey = parsedKey.solana;
        }
    } catch (e) {
        // Không phải JSON, sử dụng key gốc
    }

    // Loại bỏ dấu ngoặc kép nếu có
    solanaKey = solanaKey.replace(/^"|"$/g, '');

    // Kiểm tra định dạng base58
    try {
        const decoded = bs58.default.decode(solanaKey);
        if (decoded.length !== 64) {
            console.warn(`Warning: Private key length is ${decoded.length}, expected 64`);
        }
    } catch (e) {
        throw new Error(`Invalid private key format: ${e.message}`);
    }

    return solanaKey;
}

/**
 * Kiểm tra xem private key có hợp lệ không
 * @param privateKey Private key cần kiểm tra
 * @returns Boolean cho biết key có hợp lệ không
 */
export function isValidPrivateKey(privateKey: string): boolean {
    try {
        const solanaKey = extractSolanaPrivateKey(privateKey);
        const decoded = bs58.default.decode(solanaKey);
        return decoded.length === 64;
    } catch (e) {
        return false;
    }
} 