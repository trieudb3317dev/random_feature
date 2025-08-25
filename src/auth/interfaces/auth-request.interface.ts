import { Request } from 'express';

export interface AuthRequest extends Request {
    user: {
        id: number;
        telegram_id?: string;
        // other user properties...
    };
} 