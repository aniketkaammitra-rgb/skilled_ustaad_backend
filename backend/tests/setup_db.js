import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoMemoryServer;

/**
 * Connect to the in-memory database.
 */
export const connect = async () => {
  mongoMemoryServer = await MongoMemoryServer.create();
  const uri = mongoMemoryServer.getUri();
  await mongoose.connect(uri);
};

/**
 * Drop database, close the connection and stop the in-memory server.
 */
export const closeDatabase = async () => {
  if (mongoose.connection) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
};

/**
 * Remove all data from all collections.
 */
export const clearDatabase = async () => {
  if (mongoose.connection) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany();
    }
  }
};
