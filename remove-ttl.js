const mongoose = require('mongoose');

async function removeTTLIndex() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crypto_payments';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get the payments collection
    const db = mongoose.connection.db;
    const paymentsCollection = db.collection('payments');

    // List all indexes
    const indexes = await paymentsCollection.indexes();
    console.log('Current indexes:', indexes);

    // Find and drop the TTL index
    const ttlIndex = indexes.find(index => 
      index.key && index.key.expiresAt && index.expireAfterSeconds !== undefined
    );

    if (ttlIndex) {
      console.log('Found TTL index:', ttlIndex);
      await paymentsCollection.dropIndex(ttlIndex.name);
      console.log('✅ TTL index dropped successfully');
    } else {
      console.log('No TTL index found');
    }

    // List indexes again to confirm
    const newIndexes = await paymentsCollection.indexes();
    console.log('Indexes after removal:', newIndexes);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

removeTTLIndex();
