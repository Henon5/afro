/**
 * Emergency Room Cleanup Script
 * 
 * This script flushes all room pools to fix the "42 players" overflow issue.
 * Run this ONCE on server startup or manually to reset corrupted room states.
 * 
 * Usage: node scripts/emergency_room_reset.js
 */

const connectDB = require('../config/db');
const RoomPool = require('../models/RoomPool');
const GameSession = require('../models/GameSession');

async function emergencyRoomReset() {
  try {
    console.log('🔧 Starting Emergency Room Reset...\n');
    
    // Connect to database
    await connectDB();
    console.log('✅ Database connected\n');
    
    // Step 1: Reset all RoomPool player arrays and currentPool to 0
    console.log('📋 Flushing Room Pools...');
    const roomPools = await RoomPool.find({});
    console.log(`   Found ${roomPools.length} rooms to reset`);
    
    for (const room of roomPools) {
      console.log(`   - Room ${room.roomAmount} ETB: ${room.players?.length || 0} players → 0`);
    }
    
    await RoomPool.updateMany({}, {
      $set: { 
        currentPool: 0,
        houseTotal: 0,
        players: []
      }
    });
    console.log('✅ All Room Pools flushed\n');
    
    // Step 2: Clear all active game sessions
    console.log('🎮 Clearing Active Game Sessions...');
    const activeSessions = await GameSession.countDocuments({ 
      gameStatus: { $in: ['waiting', 'active'] } 
    });
    console.log(`   Found ${activeSessions} active sessions to clear`);
    
    await GameSession.updateMany(
      { gameStatus: { $in: ['waiting', 'active'] } },
      { 
        $set: { 
          gameStatus: 'completed',
          completedAt: new Date(),
          players: []
        } 
      }
    );
    console.log('✅ All active sessions cleared\n');
    
    // Step 3: Verify the reset
    const remainingActive = await GameSession.countDocuments({ 
      gameStatus: { $in: ['waiting', 'active'] } 
    });
    const updatedRooms = await RoomPool.find({});
    
    console.log('📊 Verification Results:');
    console.log(`   Remaining active sessions: ${remainingActive}`);
    console.log('   Room states:');
    for (const room of updatedRooms) {
      console.log(`   - Room ${room.roomAmount} ETB: ${room.players?.length || 0} players, Pool: ${room.currentPool} ETB`);
    }
    
    console.log('\n✅ Emergency Room Reset Complete!');
    console.log('   The 42-player overflow has been cleared.');
    console.log('   Rooms are now locked at 0 players until new games start.\n');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Emergency Reset Failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run the emergency reset
emergencyRoomReset();
