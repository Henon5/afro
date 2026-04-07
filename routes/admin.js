notes: Admin add: ${reason || 'Manual adjustment'}
    });

    res.json({ success: true, message: Added ${amount} ETB to ${user.firstName} });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add funds' });
  }
});

// Block/unblock user
router.post('/toggle-block', verifyAdmin, async (req, res) => {
  try {
    const { phone } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({ 
      success: true, 
      message: ${user.firstName} ${user.isBlocked ? 'blocked' : 'unblocked'} 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Reset room pools
router.post('/reset-pools', verifyAdmin, async (req, res) => {
  try {
    await GameRoom.updateMany({}, {
      currentPool: 0,
      houseEarnings: 0,
      activePlayers: [],
      $set: { 'currentGame.isActive': false }
    });
    
    res.json({ success: true, message: 'All pools reset' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset pools' });
  }
});

module.exports = router;