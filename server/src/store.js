const { MongoClient } = require('mongodb');

const connectMongo = async (mongoUrl) => {
  const client = new MongoClient(mongoUrl);
  await client.connect();
  const dbName = new URL(mongoUrl).pathname.replace(/^\//, '') || 'mbta';
  return { client, db: client.db(dbName) };
};

const ensureIndexes = async (db) => {
  await db.collection('stops').createIndex({ stopId: 1 }, { unique: true });
  await db.collection('fetches').createIndex({ fetchedAt: -1 });
};

const upsertDefaultStop = async (db, { stopId, name }) => {
  await db.collection('stops').updateOne(
    { stopId },
    {
      $setOnInsert: {
        stopId,
        name,
        pinned: true,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
};

module.exports = {
  connectMongo,
  ensureIndexes,
  upsertDefaultStop,
};

