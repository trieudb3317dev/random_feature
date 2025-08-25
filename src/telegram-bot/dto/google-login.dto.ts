export interface GoogleLoginDto {
    code: string;  // Authorization code from Google
    refCode?: string; // Referral code (optional)
} 