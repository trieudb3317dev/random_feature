export interface BirdeyeTokenOrigin {
    txHash: string;
    slot: number;
    tokenAddress: string;
    decimals: number;
    owner: string;
    blockUnixTime: number;
    blockHumanTime: string;
}

export interface BirdeyeTokenMetadata {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    extensions?: {
        description?: string;
    };
    logo_uri?: string;
}

export interface BirdeyeTokenMetadataResponse {
    success: boolean;
    data?: BirdeyeTokenMetadata;
}

export interface BirdeyeTokenOriginResponse {
    success: boolean;
    data?: BirdeyeTokenOrigin;
} 