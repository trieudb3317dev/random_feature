const { Pool } = require('pg');

// Cấu hình database - thay đổi theo môi trường của bạn
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'your_database',
  user: process.env.DB_USER || 'your_user',
  password: process.env.DB_PASSWORD || 'your_password',
});

async function fixBgRootNodes() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Starting to fix BG affiliate root nodes...');
    
    // Lấy tất cả BG affiliate trees
    const treesResult = await client.query(`
      SELECT bat_id, bat_root_wallet_id, bat_total_commission_percent 
      FROM bg_affiliate_trees
    `);
    
    const trees = treesResult.rows;
    console.log(`📊 Found ${trees.length} BG affiliate trees`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const tree of trees) {
      try {
        // Kiểm tra xem đã có root node chưa
        const existingRootResult = await client.query(`
          SELECT ban_id FROM bg_affiliate_nodes 
          WHERE ban_tree_id = $1 AND ban_parent_wallet_id IS NULL
        `, [tree.bat_id]);
        
        if (existingRootResult.rows.length > 0) {
          console.log(`✅ Tree ${tree.bat_id} already has root node for wallet ${tree.bat_root_wallet_id}`);
          continue;
        }
        
        // Tạo root node mới
        await client.query(`
          INSERT INTO bg_affiliate_nodes 
          (ban_tree_id, ban_wallet_id, ban_parent_wallet_id, ban_commission_percent, ban_effective_from)
          VALUES ($1, $2, NULL, $3, NOW())
        `, [tree.bat_id, tree.bat_root_wallet_id, tree.bat_total_commission_percent]);
        
        console.log(`✅ Created root node for tree ${tree.bat_id}, wallet ${tree.bat_root_wallet_id}`);
        fixedCount++;
        
      } catch (error) {
        console.error(`❌ Error fixing tree ${tree.bat_id}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n📈 Summary:`);
    console.log(`   - Total trees: ${trees.length}`);
    console.log(`   - Fixed: ${fixedCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Already had root nodes: ${trees.length - fixedCount - errorCount}`);
    
  } catch (error) {
    console.error(`❌ Script failed: ${error.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Chạy script
fixBgRootNodes()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }); 