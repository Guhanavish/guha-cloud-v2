require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cloud-storage');
    console.log('Connected to MongoDB');

    // Delete all existing users
    await User.deleteMany({});
    console.log('Deleted all existing users');

    // Create the single user - let the pre-save hook hash the password
    await User.create({
      username: 'guha',
      email: 'guha@local.dev',
      password: '20385',
      storageLimit: 512 * 1024 * 1024
    });

    console.log('Created user: guha / 20385');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();