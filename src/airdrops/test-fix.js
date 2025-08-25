// Test case để kiểm tra fix minimum stake amount
const testFix = () => {
    console.log('=== Test Fix - Minimum Stake Amount ===');
    
    // Test data
    const tokenBalance = 995999999.995; // Raw units từ blockchain
    const stakeAmount = 0.996; // Token amount từ user
    const tokenDecimals = 9;
    
    console.log('Input:');
    console.log(`- Token balance: ${tokenBalance} raw units`);
    console.log(`- Stake amount: ${stakeAmount} tokens`);
    console.log(`- Token decimals: ${tokenDecimals}`);
    
    // Calculate adjusted amount
    const adjustedStakeAmount = stakeAmount * Math.pow(10, tokenDecimals);
    console.log(`- Adjusted stake amount: ${adjustedStakeAmount} raw units`);
    
    // Calculate balance in tokens
    const balanceInTokens = tokenBalance / Math.pow(10, tokenDecimals);
    console.log(`- Balance in tokens: ${balanceInTokens.toFixed(tokenDecimals)} tokens`);
    
    // Check if sufficient balance
    const hasEnoughBalance = tokenBalance >= adjustedStakeAmount;
    console.log(`- Has enough balance: ${hasEnoughBalance}`);
    
    // Check minimum stake
    const minimumStake = 0.001;
    const canStakeMinimum = balanceInTokens >= minimumStake;
    console.log(`- Can stake minimum (${minimumStake}): ${canStakeMinimum}`);
    
    console.log('\nResult:');
    if (hasEnoughBalance) {
        console.log('✅ Balance check passed - can stake');
    } else {
        console.log('❌ Insufficient balance - cannot stake');
        console.log(`Current: ${balanceInTokens.toFixed(tokenDecimals)} tokens`);
        console.log(`Required: ${stakeAmount} tokens`);
        console.log(`Missing: ${stakeAmount - balanceInTokens} tokens`);
    }
    
    if (canStakeMinimum) {
        console.log('✅ Can stake minimum amount');
        console.log(`Suggestions: Try staking ${balanceInTokens.toFixed(3)} tokens or less`);
    } else {
        console.log('❌ Cannot even stake minimum amount');
    }
    
    console.log('\n=== Test Cases ===');
    
    // Test case 1: Stake 0.996 tokens (current balance)
    const testStake0996 = 0.996;
    const adjusted0996 = testStake0996 * Math.pow(10, tokenDecimals);
    const canStake0996 = tokenBalance >= adjusted0996;
    console.log(`Test stake ${testStake0996} token: ${canStake0996 ? '✅' : '❌'}`);
    
    // Test case 2: Stake 0.5 tokens
    const testStake05 = 0.5;
    const adjusted05 = testStake05 * Math.pow(10, tokenDecimals);
    const canStake05 = tokenBalance >= adjusted05;
    console.log(`Test stake ${testStake05} token: ${canStake05 ? '✅' : '❌'}`);
    
    // Test case 3: Stake 0.001 tokens (minimum)
    const testStake0001 = 0.001;
    const adjusted0001 = testStake0001 * Math.pow(10, tokenDecimals);
    const canStake0001 = tokenBalance >= adjusted0001;
    console.log(`Test stake ${testStake0001} token: ${canStake0001 ? '✅' : '❌'}`);
    
    // Test case 4: Stake 1 token
    const testStake1 = 1;
    const adjusted1 = testStake1 * Math.pow(10, tokenDecimals);
    const canStake1 = tokenBalance >= adjusted1;
    console.log(`Test stake ${testStake1} token: ${canStake1 ? '✅' : '❌'}`);
};

// Run test
testFix(); 