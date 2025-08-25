import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class ChangeBgAffiliateFlowDto {
  @ApiProperty({
    description: 'ID của ví cần thay đổi luồng BG',
    example: 123
  })
  @IsNumber()
  walletId: number;

  @ApiProperty({
    description: 'ID của ví cha mới (người giới thiệu tuyến trên mới)',
    example: 456
  })
  @IsNumber()
  newParentWalletId: number;
}

export class ChangeBgAffiliateFlowResponseDto {
  @ApiProperty({
    description: 'Trạng thái thành công',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Thông báo kết quả',
    example: 'BG affiliate flow changed successfully'
  })
  message: string;

  @ApiProperty({
    description: 'ID của ví đã thay đổi',
    example: 123
  })
  walletId: number;

  @ApiProperty({
    description: 'ID của ví cha cũ',
    example: 789,
    nullable: true
  })
  oldParentWalletId: number | null;

  @ApiProperty({
    description: 'ID của ví cha mới',
    example: 456
  })
  newParentWalletId: number;

  @ApiProperty({
    description: 'Thông tin thay đổi cây affiliate'
  })
  treeChanges: {
    oldTreeId: number;
    newTreeId: number;
    affectedNodes: number;
  };

  @ApiProperty({
    description: 'Thông tin chi tiết node'
  })
  nodeInfo: {
    walletId: number;
    nickName: string;
    solanaAddress: string;
    oldParentWalletId: number | null;
    newParentWalletId: number;
    oldTreeId: number;
    newTreeId: number;
    newCommissionPercent: number;
    affectedDescendants: number;
    reason: string;
  };
}
