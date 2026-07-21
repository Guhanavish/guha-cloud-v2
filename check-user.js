const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('./src/models/User');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cloud-storage');
  const user = await User.findOne({username: 'guha'}).select('+password');
  console.log('User found:', !!user);
  if (user) {
    console.log('Username:', user.username);
    console.log('Email:', user.email);
    console.log('Password hash:', user.password.substring(0, 30) + '...');
    const match = await bcrypt.compare('20385', user.password);
    console.log('Password match:', match);
  }
  process.exit(0);
}
check();