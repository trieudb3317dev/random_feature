export class AirdropStakingLeaderboardEntryDto {
  rank: number;
  poolId: number;
  poolName: string;
  poolSlug: string;
  poolLogo?: string;
  totalPoolVolume: number;
  memberCount: number;
  volumeTier: string;
  walletId: number;
  solanaAddress: string;
  nickName?: string;
  isBittworld: boolean;
  bittworldUid?: string | null;
  stakedVolume: number;
  percentageOfPool: number;
  isCreator: boolean;
  stakingDate: Date;
}

export class AirdropStakingLeaderboardResponseDto {
  success: boolean;
  message: string;
  data: AirdropStakingLeaderboardEntryDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class SendLeaderboardEmailResponseDto {
  success: boolean;
  message: string;
  emailSent: boolean;
  recipients: string[];
  vip5Count: number;
  vip6Count: number;
  vip7Count: number;
} 