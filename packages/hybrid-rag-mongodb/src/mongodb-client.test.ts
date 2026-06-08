import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoDBVectorClientWrapper } from './mongodb-client.js';

const mocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  command: vi.fn().mockResolvedValue({}),
  db: vi.fn(),
  collection: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  aggregate: vi.fn(),
  aggregateToArray: vi.fn(),
  updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
  bulkWrite: vi.fn().mockResolvedValue({}),
  drop: vi.fn().mockResolvedValue(undefined),
  countDocuments: vi.fn().mockResolvedValue(0),
  find: vi.fn(),
  findSortLimitToArray: vi.fn(),
  listCollectionsToArray: vi.fn(),
}));

vi.mock('mongodb', () => {
  const mockCollection = {
    aggregate: (...args: unknown[]) => {
      mocks.aggregate(...args);
      return { toArray: mocks.aggregateToArray };
    },
    updateOne: mocks.updateOne,
    bulkWrite: mocks.bulkWrite,
    drop: mocks.drop,
    countDocuments: mocks.countDocuments,
    find: (...args: unknown[]) => {
      mocks.find(...args);
      return {
        sort: vi.fn(() => ({
          limit: vi.fn(() => ({ toArray: mocks.findSortLimitToArray })),
        })),
      };
    },
  };

  const mockDb = {
    collection: (...args: unknown[]) => {
      mocks.collection(...args);
      return mockCollection;
    },
    command: mocks.command,
    listCollections: vi.fn(() => ({
      toArray: mocks.listCollectionsToArray,
    })),
  };

  class MockMongoClient {
    connect = mocks.connect;
    db = (...args: unknown[]) => {
      mocks.db(...args);
      return mockDb;
    };
    close = mocks.close;
  }

  return {
    MongoClient: MockMongoClient as any,
    Collection: class {},
    Document: class {},
  };
});

describe('MongoDBVectorClientWrapper', () => {
  const validConfig = {
    connectionString: 'mongodb://localhost:27017',
    databaseName: 'testdb',
    collectionName: 'testcoll',
    vectorIndexName: 'testidx',
    vectorDimension: 1536,
  };

  let wrapper: MongoDBVectorClientWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    wrapper = new MongoDBVectorClientWrapper(validConfig);
  });

  describe('constructor', () => {
    it('should set provider', () => {
      expect(wrapper.provider).toBe('mongodb');
    });

    it('should expose capabilities', () => {
      expect(wrapper.capabilities.supportsHybridSearch).toBe(false);
      expect(wrapper.capabilities.supportsMetadataFiltering).toBe(true);
      expect(wrapper.capabilities.supportsBatchUpsert).toBe(true);
      expect(wrapper.capabilities.supportsCollectionManagement).toBe(true);
      expect(wrapper.capabilities.supportsMultiTenancy).toBe(true);
      expect(wrapper.capabilities.supportsQuantization).toBe(true);
      expect(wrapper.capabilities.supportsScan).toBe(true);
      expect(wrapper.capabilities.maxBatchSize).toBe(1000);
      expect(wrapper.capabilities.maxVectorDimension).toBe(4096);
    });

    it('should expose cost model', () => {
      expect(wrapper.costModel.costPerQueryEstimate).toBe(0);
      expect(wrapper.costModel.costPer1000Upserts).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should connect and create index', async () => {
      await wrapper.initialize();

      expect(mocks.connect).toHaveBeenCalled();
      expect(mocks.db).toHaveBeenCalledWith('testdb');
      expect(mocks.collection).toHaveBeenCalledWith('testcoll');
      expect(mocks.command).toHaveBeenCalled();
      const cmdArg = mocks.command.mock.calls[0][0];
      expect(cmdArg.createIndexes).toBe('testcoll');
      expect(cmdArg.indexes[0].name).toBe('testidx');
    });

    it('should be idempotent', async () => {
      await wrapper.initialize();
      await wrapper.initialize();
      expect(mocks.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent initialize calls', async () => {
      const [_r1, _r2] = await Promise.all([wrapper.initialize(), wrapper.initialize()]);
      expect(mocks.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle index creation error gracefully', async () => {
      mocks.command.mockRejectedValueOnce(new Error('index already exists'));
      await wrapper.initialize();
      expect(mocks.connect).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    const searchOptions = { vector: [0.1, 0.2, 0.3], topK: 10 };

    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should return results from vector search', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([
        {
          _id: 'chunk1',
          chunkId: 'chunk1',
          documentId: 'doc1',
          content: 'test content',
          score: 0.95,
          metadata: { key: 'val' },
        },
      ]);

      const results = await wrapper.search(searchOptions);

      expect(results).toHaveLength(1);
      expect(results[0].chunkId).toBe('chunk1');
      expect(results[0].documentId).toBe('doc1');
      expect(results[0].content).toBe('test content');
      expect(results[0].score).toBe(0.95);
      expect(results[0].source).toBe('vector');
      expect(results[0].metadata).toEqual({ key: 'val' });
    });

    it('should include filter stage in pipeline', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);

      await wrapper.search({ ...searchOptions, filter: { status: 'active' } });

      const pipeline = mocks.aggregate.mock.calls[0][0];
      expect(pipeline).toHaveLength(3);
      expect(pipeline[0].$vectorSearch).toBeDefined();
      expect(pipeline[1].$match).toEqual({ 'payload.status': 'active' });
      expect(pipeline[2].$project).toBeDefined();
    });

    it('should return empty array when no results', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      const results = await wrapper.search(searchOptions);
      expect(results).toEqual([]);
    });

    it('should handle missing fields gracefully', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([{}]);
      const results = await wrapper.search(searchOptions);
      expect(results[0].chunkId).toBe('');
      expect(results[0].documentId).toBe('');
      expect(results[0].content).toBe('');
      expect(results[0].score).toBe(0);
    });
  });

  describe('upsertPoint', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should upsert with correct format', async () => {
      await wrapper.upsertPoint({
        id: 'point1',
        vector: [0.1, 0.2, 0.3],
        payload: { content: 'hello', documentId: 'doc1', extra: true },
      });

      expect(mocks.updateOne).toHaveBeenCalledWith(
        { _id: 'point1' },
        {
          $set: {
            vector: [0.1, 0.2, 0.3],
            payload: { content: 'hello', documentId: 'doc1', extra: true },
          },
        },
        { upsert: true },
      );
    });
  });

  describe('upsertBatch', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should bulk write points', async () => {
      const points = Array.from({ length: 3 }, (_, i) => ({
        id: `p${i}`,
        vector: [0.1, 0.2],
        payload: { idx: i },
      }));

      await wrapper.upsertBatch(points);

      expect(mocks.bulkWrite).toHaveBeenCalledTimes(1);
      const ops = mocks.bulkWrite.mock.calls[0][0];
      expect(ops).toHaveLength(3);
      expect(ops[0].updateOne.filter).toEqual({ _id: 'p0' });
      expect(ops[0].updateOne.update.$set.vector).toEqual([0.1, 0.2]);
      expect(ops[2].updateOne.filter).toEqual({ _id: 'p2' });
    });

    it('should batch in chunks of maxBatchSize', async () => {
      const points = Array.from({ length: 2500 }, (_, i) => ({
        id: `p${i}`,
        vector: [0.1],
        payload: {},
      }));

      await wrapper.upsertBatch(points);

      expect(mocks.bulkWrite).toHaveBeenCalledTimes(3);
    });
  });

  describe('deleteCollection', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should drop default collection when name is empty', async () => {
      await wrapper.deleteCollection('');
      expect(mocks.drop).toHaveBeenCalled();
    });

    it('should drop named collection', async () => {
      await wrapper.deleteCollection('othercoll');
      expect(mocks.collection).toHaveBeenCalledWith('othercoll');
      expect(mocks.drop).toHaveBeenCalled();
    });
  });

  describe('getCollectionInfo', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should return stats with vector count', async () => {
      mocks.countDocuments.mockResolvedValueOnce(42);
      const info = await wrapper.getCollectionInfo('mycoll');
      expect(info).toEqual({
        collectionName: 'mycoll',
        vectorCount: 42,
        vectorDimension: 1536,
      });
    });

    it('should use default collection when name is empty', async () => {
      mocks.countDocuments.mockResolvedValueOnce(7);
      const info = await wrapper.getCollectionInfo('');
      expect(info?.vectorCount).toBe(7);
    });

    it('should return null on error', async () => {
      mocks.countDocuments.mockRejectedValueOnce(new Error('fail'));
      const info = await wrapper.getCollectionInfo('mycoll');
      expect(info).toBeNull();
    });
  });

  describe('listCollections', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should return collection names', async () => {
      mocks.listCollectionsToArray.mockResolvedValueOnce([{ name: 'coll1' }, { name: 'coll2' }]);
      const names = await wrapper.listCollections();
      expect(names).toEqual(['coll1', 'coll2']);
    });

    it('should return empty array on error', async () => {
      mocks.listCollectionsToArray.mockRejectedValueOnce(new Error('fail'));
      const names = await wrapper.listCollections();
      expect(names).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('should return false when not initialized', async () => {
      const healthy = await wrapper.healthCheck();
      expect(healthy).toBe(false);
    });

    it('should return true on ping success', async () => {
      await wrapper.initialize();
      const healthy = await wrapper.healthCheck();
      expect(healthy).toBe(true);
      expect(mocks.command).toHaveBeenCalledWith({ ping: 1 });
    });

    it('should return false on ping error', async () => {
      await wrapper.initialize();
      mocks.command.mockRejectedValueOnce(new Error('fail'));
      const healthy = await wrapper.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should close the client', async () => {
      await wrapper.initialize();
      await wrapper.close();
      expect(mocks.close).toHaveBeenCalled();
    });

    it('should not throw when not initialized', async () => {
      await wrapper.close();
      expect(mocks.close).not.toHaveBeenCalled();
    });
  });

  describe('scanPoints', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should scan without cursor', async () => {
      mocks.findSortLimitToArray.mockResolvedValueOnce([
        { _id: 'p1', vector: [0.1, 0.2], payload: { text: 'a' } },
        { _id: 'p2', vector: [0.3, 0.4], payload: { text: 'b' } },
      ]);

      const result = await wrapper.scanPoints('mycoll', { batchSize: 2 });

      expect(mocks.find).toHaveBeenCalledWith({});
      expect(result.points).toHaveLength(2);
      expect(result.points[0].id).toBe('p1');
      expect(result.points[0].vector).toEqual([0.1, 0.2]);
      expect(result.points[0].payload).toEqual({ text: 'a' });
      expect(result.points[1].id).toBe('p2');
      expect(result.nextCursor).toBe('p2');
    });

    it('should filter with cursor', async () => {
      mocks.findSortLimitToArray.mockResolvedValueOnce([{ _id: 'p3', vector: [], payload: {} }]);

      const result = await wrapper.scanPoints('mycoll', {
        batchSize: 10,
        cursor: 'p2',
      });

      expect(mocks.find).toHaveBeenCalledWith({ _id: { $gt: 'p2' } });
      expect(result.nextCursor).toBeUndefined();
    });

    it('should use default collection when name is empty', async () => {
      mocks.findSortLimitToArray.mockResolvedValueOnce([]);
      await wrapper.scanPoints('', { batchSize: 100 });
      expect(mocks.find).toHaveBeenCalled();
    });

    it('should handle empty vectors and payloads', async () => {
      mocks.findSortLimitToArray.mockResolvedValueOnce([{ _id: 'p1' }]);
      const result = await wrapper.scanPoints('mycoll');
      expect(result.points[0].vector).toEqual([]);
      expect(result.points[0].payload).toEqual({});
    });
  });

  describe('ensureInitialized', () => {
    it('should throw on search before init', async () => {
      await expect(wrapper.search({ vector: [0.1], topK: 5 })).rejects.toThrow('not initialized');
    });

    it('should throw on upsertPoint before init', async () => {
      await expect(wrapper.upsertPoint({ id: 'p1', vector: [0.1], payload: {} })).rejects.toThrow(
        'not initialized',
      );
    });

    it('should throw on upsertBatch before init', async () => {
      await expect(wrapper.upsertBatch([])).rejects.toThrow('not initialized');
    });

    it('should throw on deleteCollection before init', async () => {
      await expect(wrapper.deleteCollection('x')).rejects.toThrow('not initialized');
    });

    it('should throw on scanPoints before init', async () => {
      await expect(wrapper.scanPoints('x')).rejects.toThrow('not initialized');
    });
  });

  describe('filter building', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('$eq', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $eq: 'v' } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({ 'payload.f': 'v' });
    });

    it('$ne', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $ne: 'v' } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({ 'payload.f': { $ne: 'v' } });
    });

    it('$in', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $in: ['a', 'b'] } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({
        'payload.f': { $in: ['a', 'b'] },
      });
    });

    it('$nin', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $nin: ['a', 'b'] } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({
        'payload.f': { $nin: ['a', 'b'] },
      });
    });

    it('$gt', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $gt: 10 } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({ 'payload.f': { $gt: 10 } });
    });

    it('$gte', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $gte: 10 } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({ 'payload.f': { $gte: 10 } });
    });

    it('$lt', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $lt: 10 } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({ 'payload.f': { $lt: 10 } });
    });

    it('$lte', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $lte: 10 } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({ 'payload.f': { $lte: 10 } });
    });

    it('$exists true', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $exists: true } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({
        'payload.f': { $exists: true },
      });
    });

    it('$exists false', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $exists: false } } });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({
        'payload.f': { $exists: false },
      });
    });

    it('$and', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({
        vector: [0.1],
        topK: 5,
        filter: { $and: [{ a: 'x' }, { b: 'y' }] },
      });
      const match = mocks.aggregate.mock.calls[0][0][1].$match;
      expect(match.$and).toHaveLength(2);
      expect(match.$and[0]).toEqual({ 'payload.a': 'x' });
      expect(match.$and[1]).toEqual({ 'payload.b': 'y' });
    });

    it('$or', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({
        vector: [0.1],
        topK: 5,
        filter: { $or: [{ a: 'x' }, { b: 'y' }] },
      });
      const match = mocks.aggregate.mock.calls[0][0][1].$match;
      expect(match.$or).toHaveLength(2);
    });

    it('null value maps to $eq null', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({
        vector: [0.1],
        topK: 5,
        filter: { field: null },
      });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({
        'payload.field': { $eq: null },
      });
    });

    it('direct value maps to equality', async () => {
      mocks.aggregateToArray.mockResolvedValueOnce([]);
      await wrapper.search({
        vector: [0.1],
        topK: 5,
        filter: { field: 'direct' },
      });
      expect(mocks.aggregate.mock.calls[0][0][1].$match).toEqual({ 'payload.field': 'direct' });
    });
  });
});
