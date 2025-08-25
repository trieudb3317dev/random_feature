# Airdrop Calculation Example

## Scenario:
- **Token:** MMP, `alt_amount_airdrop_1 = 100,000,000`
- **Pool A:** `apl_volume = 500,000`, `apj_volume = 300,000` (total: 800,000)
- **Total volume:** 1,000,000
- **M:** Creator of Pool A, also stakes `apj_volume = 100,000`
- **N:** Staker in Pool A, stakes `apj_volume = 200,000`

## Calculation Steps:

### Step 1: Calculate Pool A's Percentage
```
Pool A total volume (X) = apl_volume + apj_volume = 500,000 + 300,000 = 800,000
Total system volume (M) = 1,000,000
Pool A percentage = X/M = 800,000/1,000,000 = 80%
```

### Step 2: Calculate Pool A's Reward
```
Pool A reward (Y) = alt_amount_airdrop_1 × Pool A percentage
Y = 100,000,000 × 80% = 80,000,000
```

### Step 3: Distribute Rewards in Pool A

#### Creator Reward (10%):
```
Creator reward = 10% × Y = 10% × 80,000,000 = 8,000,000
```

#### Remaining Reward (90%):
```
Remaining reward = 90% × Y = 90% × 80,000,000 = 72,000,000
```

### Step 4: Calculate Individual Rewards

#### For M (Creator):
```
M's total volume in Pool A = apl_volume + M's stake = 500,000 + 100,000 = 600,000
M's percentage in Pool A = 600,000/800,000 = 75%
M's share of remaining 90% = 72,000,000 × 75% = 54,000,000
M's total reward = Creator reward + M's share of remaining = 8,000,000 + 54,000,000 = 62,000,000
```

#### For N (Staker):
```
N's total volume in Pool A = N's stake = 200,000
N's percentage in Pool A = 200,000/800,000 = 25%
N's share of remaining 90% = 72,000,000 × 25% = 18,000,000
N's total reward = 18,000,000
```

## Database Records:

### For M (Creator):
```sql
INSERT INTO airdrop_rewards (
  ar_token_airdrop_id,
  ar_wallet_id,
  ar_wallet_address,
  ar_amount,
  ar_type,
  ar_status,
  ar_hash
) VALUES (
  1,                    -- MMP token ID
  123,                  -- M's wallet_id
  'M_solana_address',   -- M's wallet address
  62000000,             -- 62,000,000 reward
  '1',                  -- TYPE_1
  'can_withdraw',       -- CAN_WITHDRAW
  NULL                  -- hash (null initially)
);
```

### For N (Staker):
```sql
INSERT INTO airdrop_rewards (
  ar_token_airdrop_id,
  ar_wallet_id,
  ar_wallet_address,
  ar_amount,
  ar_type,
  ar_status,
  ar_hash
) VALUES (
  1,                    -- MMP token ID
  456,                  -- N's wallet_id
  'N_solana_address',   -- N's wallet address
  18000000,             -- 18,000,000 reward
  '1',                  -- TYPE_1
  'can_withdraw',       -- CAN_WITHDRAW
  NULL                  -- hash (null initially)
);
```

## Summary:
- **M (Creator):** 62,000,000 tokens (8,000,000 from 10% + 54,000,000 from 90% share)
- **N (Staker):** 18,000,000 tokens (from 90% share)
- **Total distributed:** 80,000,000 tokens (100% of Pool A's reward)

## Verification:
```
M's reward + N's reward = 62,000,000 + 18,000,000 = 80,000,000 ✓
This equals Pool A's total reward (Y) ✓
```

## Key Points:
1. **Creator gets 10% bonus** regardless of their stake
2. **Remaining 90% is distributed proportionally** based on total volume contribution
3. **Creator's total volume** includes both initial pool creation + their stake
4. **Stakers' total volume** is only their stake amount
5. **All calculations are based on volume percentages** within the pool 