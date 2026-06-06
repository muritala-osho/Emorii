
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function makeUserAdmin(email) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email });
    
    if (!user) {
      console.log(`User not found`);
      process.exit(1);
    }

    user.isAdmin = true;
    await user.save();

    console.log(`✅ User ${user._id} is now an admin!`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('Usage: node makeAdmin.js <email>');
  console.log('Example: node makeAdmin.js admin@emorii.app');
  process.exit(1);
}

makeUserAdmin(email);
