const mongoose = require('mongoose');

console.log('Attempting to connect...');

mongoose.connect('mongodb://localhost:27017/cloud-storage')
  .then(() => {
    console.log('Connected successfully!');
    process.exit(0);
  })
  .catch(e => {
    console.log('Error:', e.message);
    process.exit(1);
  });

// Timeout after 5 seconds
setTimeout(() => {
  console.log('Timeout - connection taking too long');
  process.exit(1);
}, 5000);