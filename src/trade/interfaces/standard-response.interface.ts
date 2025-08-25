export interface StandardResponse<T> {
    status: number;
    message: string;
    error?: string;
    data?: T;
} 