import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisVectorClientWrapper } from './redis-client.js';

const mocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  ftSearch: vi.fn(),
  ftInfo: vi.fn(),
  ftCreate: vi.fn().mockResolvedValue(undefined),
  ftDropIndex: vi.fn().mockResolvedValue(undefined),
  ftList: vi.fn(),
  jsonSet: vi.fn().mockResolvedValue(undefined),
  jsonGet: vi.fn(),
  scan: vi.fn(),
  ping: vi.fn(),
  multiJsonSet: vi.fn().mockResolvedValue(undefined),
  multiExec: vi.fn().mockResolvedValue([]),
}));

vi.mock('redis', () => {
  const mockClient = {
    connect: mocks.connect,
    ft: {
      search: mocks.ftSearch,
      info: mocks.ftInfo,
      create: mocks.ftCreate,
      dropIndex: mocks.ftDropIndex,
      _list: mocks.ftList,
    },
    json: {
      set: mocks.jsonSet,
      get: mocks.jsonGet,
    },
    scan: mocks.scan,
    ping: mocks.ping,
    multi: vi.fn(() => ({
      json: { set: mocks.multiJsonSet },
      exec: mocks.multiExec,
    })),
    quit: mocks.quit,
  };
  return { createClient: vi.fn(() => mockClient) };
});

describe('RedisVectorClientWrapper', () => {
  const validConfig = {
    url: 'redis://localhost:6379',
    indexName: 'testidx',
    vectorDimension: 1536,
  };

  let wrapper: RedisVectorClientWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    wrapper = new RedisVectorClientWrapper(validConfig);
  });

  describe('constructor', () => {
    it('should set provider', () => {
      expect(wrapper.provider).toBe('redis');
    });

    it('should expose capabilities', () => {
      expect(wrapper.capabilities.supportsHybridSearch).toBe(true);
      expect(wrapper.capabilities.supportsMetadataFiltering).toBe(true);
      expect(wrapper.capabilities.supportsBatchUpsert).toBe(true);
      expect(wrapper.capabilities.supportsCollectionManagement).toBe(true);
      expect(wrapper.capabilities.supportsMultiTenancy).toBe(true);
      expect(wrapper.capabilities.supportsQuantization).toBe(false);
      expect(wrapper.capabilities.supportsScan).toBe(true);
      expect(wrapper.capabilities.maxBatchSize).toBe(1000);
      expect(wrapper.capabilities.maxVectorDimension).toBe(32768);
    });

    it('should expose cost model', () => {
      expect(wrapper.costModel.costPerQueryEstimate).toBe(0);
      expect(wrapper.costModel.costPer1000Upserts).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should connect and create index when missing', async () => {
      mocks.ftInfo.mockRejectedValueOnce(new Error('not found'));

      await wrapper.initialize();

      expect(mocks.connect).toHaveBeenCalled();
      expect(mocks.ftInfo).toHaveBeenCalledWith('testidx');
      expect(mocks.ftCreate).toHaveBeenCalledWith(
        'testidx',
        expect.any(Object),
        expect.objectContaining({ ON: 'JSON', PREFIX: 'vector:' }),
      );
    });

    it('should not create index when it exists', async () => {
      mocks.ftInfo.mockResolvedValueOnce({ numDocs: 10 });

      await wrapper.initialize();

      expect(mocks.ftInfo).toHaveBeenCalled();
      expect(mocks.ftCreate).not.toHaveBeenCalled();
    });

    it('should be idempotent', async () => {
      await wrapper.initialize();
      await wrapper.initialize();
      expect(mocks.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent initialize calls', async () => {
      await Promise.all([wrapper.initialize(), wrapper.initialize()]);
      expect(mocks.connect).toHaveBeenCalledTimes(1);
    });

    it('should use custom key prefix', async () => {
      mocks.ftInfo.mockRejectedValueOnce(new Error('not found'));
      const custom = new RedisVectorClientWrapper({
        ...validConfig,
        keyPrefix: 'custom:',
      });
      await custom.initialize();
      expect(mocks.ftCreate).toHaveBeenCalledWith(
        'testidx',
        expect.any(Object),
        expect.objectContaining({ PREFIX: 'custom:' }),
      );
    });
  });

  describe('search', () => {
    const searchOptions = { vector: [0.1, 0.2, 0.3], topK: 10 };

    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should perform vector KNN search', async () => {
      mocks.ftSearch.mockResolvedValueOnce({
        documents: [
          {
            id: 'vector:key1',
            value: {
              id: 'key1',
              score: 0.95,
              payload: { documentId: 'doc1', content: 'test content', extra: true },
            },
          },
        ],
      });

      const results = await wrapper.search(searchOptions);

      expect(mocks.ftSearch).toHaveBeenCalledWith(
        'testidx',
        '(*)=>[KNN 10 @vector $vector AS score]',
        expect.objectContaining({
          PARAMS: { vector: '[0.1,0.2,0.3]' },
          SORTBY: 'score',
          DIALECT: 2,
        }),
      );
      expect(results).toHaveLength(1);
      expect(results[0].chunkId).toBe('key1');
      expect(results[0].documentId).toBe('doc1');
      expect(results[0].content).toBe('test content');
      expect(results[0].score).toBe(0.95);
      expect(results[0].source).toBe('vector');
      expect(results[0].metadata).toEqual({
        documentId: 'doc1',
        content: 'test content',
        extra: true,
      });
    });

    it('should return empty array for no results', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      const results = await wrapper.search(searchOptions);
      expect(results).toEqual([]);
    });

    it('should handle null value in document', async () => {
      mocks.ftSearch.mockResolvedValueOnce({
        documents: [{ id: 'k1', value: null }],
      });
      const results = await wrapper.search(searchOptions);
      expect(results[0].chunkId).toBe('k1');
      expect(results[0].documentId).toBe('');
      expect(results[0].content).toBe('');
      expect(results[0].score).toBe(0);
    });

    it('should include filter in KNN query', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });

      await wrapper.search({ ...searchOptions, filter: { status: 'active' } });

      const query = mocks.ftSearch.mock.calls[0][1];
      expect(query).toBe('(@payload_status:{active})=>[KNN 10 @vector $vector AS score]');
    });

    it('should include hybridQuery in KNN query', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });

      await wrapper.search({ ...searchOptions, hybridQuery: 'hello world' });

      const query = mocks.ftSearch.mock.calls[0][1];
      expect(query).toBe('(hello world)=>[KNN 10 @vector $vector AS score]');
    });

    it('should include both filter and hybridQuery', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });

      await wrapper.search({
        ...searchOptions,
        filter: { status: 'active' },
        hybridQuery: 'hello world',
      });

      const query = mocks.ftSearch.mock.calls[0][1];
      expect(query).toBe(
        '(@payload_status:{active} hello world)=>[KNN 10 @vector $vector AS score]',
      );
    });

    it('should sanitize hybridQuery', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });

      await wrapper.search({ ...searchOptions, hybridQuery: 'hello! @world #test' });

      const query = mocks.ftSearch.mock.calls[0][1];
      expect(query).toBe('(hello world test)=>[KNN 10 @vector $vector AS score]');
    });

    it('should skip hybridQuery when only special chars', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });

      await wrapper.search({ ...searchOptions, hybridQuery: '!@#$%' });

      const query = mocks.ftSearch.mock.calls[0][1];
      expect(query).toBe('(*)=>[KNN 10 @vector $vector AS score]');
    });

    it('should handle missing value fields', async () => {
      mocks.ftSearch.mockResolvedValueOnce({
        documents: [{ id: 'k1', value: { id: 'k1' } }],
      });
      const results = await wrapper.search(searchOptions);
      expect(results[0].content).toBe('');
      expect(results[0].score).toBe(0);
    });
  });

  describe('upsertPoint', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should set JSON with correct key and payload', async () => {
      await wrapper.upsertPoint({
        id: 'point1',
        vector: [0.1, 0.2, 0.3],
        payload: { content: 'hello', documentId: 'doc1', extra: true },
      });

      expect(mocks.jsonSet).toHaveBeenCalledWith('vector:point1', '$', {
        id: 'point1',
        vector: [0.1, 0.2, 0.3],
        payload: { content: 'hello', documentId: 'doc1', extra: true, id: 'point1' },
      });
    });

    it('should use custom key prefix', async () => {
      const custom = new RedisVectorClientWrapper({
        ...validConfig,
        keyPrefix: 'custom:',
      });
      await custom.initialize();
      vi.clearAllMocks();

      await custom.upsertPoint({
        id: 'p1',
        vector: [0.1],
        payload: {},
      });

      expect(mocks.jsonSet).toHaveBeenCalledWith('custom:p1', '$', expect.any(Object));
    });

    it('should handle missing content in payload', async () => {
      await wrapper.upsertPoint({
        id: 'p1',
        vector: [0.1],
        payload: { documentId: 'doc1' },
      });

      const callArg = mocks.jsonSet.mock.calls[0][2] as Record<string, unknown>;
      expect((callArg.payload as Record<string, unknown>).content).toBe('');
    });
  });

  describe('upsertBatch', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should use multi/exec for batch upsert', async () => {
      const points = Array.from({ length: 3 }, (_, i) => ({
        id: `p${i}`,
        vector: [0.1],
        payload: { idx: i },
      }));

      await wrapper.upsertBatch(points);

      expect(mocks.multiExec).toHaveBeenCalled();
      expect(mocks.multiJsonSet).toHaveBeenCalledTimes(3);
    });

    it('should use correct key prefix in batch', async () => {
      const points = [{ id: 'p1', vector: [0.1], payload: {} }];
      await wrapper.upsertBatch(points);

      expect(mocks.multiJsonSet).toHaveBeenCalledWith('vector:p1', '$', expect.any(Object));
    });
  });

  describe('deleteCollection', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should drop index', async () => {
      await wrapper.deleteCollection('testidx');
      expect(mocks.ftDropIndex).toHaveBeenCalledWith('testidx');
    });

    it('should handle drop error gracefully', async () => {
      mocks.ftDropIndex.mockRejectedValueOnce(new Error('not found'));
      await wrapper.deleteCollection('testidx');
      expect(mocks.ftDropIndex).toHaveBeenCalled();
    });
  });

  describe('getCollectionInfo', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should return stats from ft.info', async () => {
      mocks.ftInfo.mockResolvedValueOnce({ numDocs: '42' });
      const info = await wrapper.getCollectionInfo('testidx');
      expect(info).toEqual({
        collectionName: 'testidx',
        vectorCount: 42,
        vectorDimension: 1536,
      });
    });

    it('should return null on error', async () => {
      mocks.ftInfo.mockRejectedValueOnce(new Error('fail'));
      const info = await wrapper.getCollectionInfo('testidx');
      expect(info).toBeNull();
    });

    it('should handle nullish numDocs', async () => {
      mocks.ftInfo.mockResolvedValueOnce({ numDocs: null });
      const info = await wrapper.getCollectionInfo('testidx');
      expect(info?.vectorCount).toBe(0);
    });
  });

  describe('listCollections', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should return index names', async () => {
      mocks.ftList.mockResolvedValueOnce(['idx1', 'idx2']);
      const names = await wrapper.listCollections();
      expect(names).toEqual(['idx1', 'idx2']);
    });

    it('should return empty array on error', async () => {
      mocks.ftList.mockRejectedValueOnce(new Error('fail'));
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
      mocks.ping.mockResolvedValueOnce('PONG');
      const healthy = await wrapper.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false on ping error', async () => {
      await wrapper.initialize();
      mocks.ping.mockRejectedValueOnce(new Error('fail'));
      const healthy = await wrapper.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should quit the client', async () => {
      await wrapper.initialize();
      await wrapper.close();
      expect(mocks.quit).toHaveBeenCalled();
    });

    it('should not throw when not initialized', async () => {
      await wrapper.close();
      expect(mocks.quit).not.toHaveBeenCalled();
    });
  });

  describe('scanPoints', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should scan keys and fetch JSON', async () => {
      mocks.scan.mockResolvedValueOnce({
        cursor: '0',
        keys: ['vector:p1', 'vector:p2'],
      });
      mocks.jsonGet
        .mockResolvedValueOnce([{ id: 'p1', vector: [0.1], payload: { text: 'a' } }])
        .mockResolvedValueOnce([{ id: 'p2', vector: [0.2], payload: { text: 'b' } }]);

      const result = await wrapper.scanPoints('mycoll', { batchSize: 10 });

      expect(mocks.scan).toHaveBeenCalledWith('0', { MATCH: 'vector:*', COUNT: 10 });
      expect(result.points).toHaveLength(2);
      expect(result.points[0].id).toBe('p1');
      expect(result.points[0].vector).toEqual([0.1]);
      expect(result.points[0].payload).toEqual({ text: 'a' });
      expect(result.nextCursor).toBeUndefined();
    });

    it('should handle cursor continuation', async () => {
      mocks.scan.mockResolvedValueOnce({
        cursor: '37',
        keys: ['vector:p1'],
      });
      mocks.jsonGet.mockResolvedValueOnce([{ id: 'p1', vector: [], payload: {} }]);

      const result = await wrapper.scanPoints('mycoll', { batchSize: 100, cursor: '15' });

      expect(mocks.scan).toHaveBeenCalledWith('15', { MATCH: 'vector:*', COUNT: 100 });
      expect(result.nextCursor).toBe('37');
    });

    it('should handle JSON.GET returning single object', async () => {
      mocks.scan.mockResolvedValueOnce({
        cursor: '0',
        keys: ['vector:p1'],
      });
      mocks.jsonGet.mockResolvedValueOnce({ id: 'p1', vector: [0.5], payload: {} });

      const result = await wrapper.scanPoints('mycoll');
      expect(result.points).toHaveLength(1);
      expect(result.points[0].vector).toEqual([0.5]);
    });

    it('should handle JSON.GET failure gracefully', async () => {
      mocks.scan.mockResolvedValueOnce({
        cursor: '0',
        keys: ['vector:p1', 'vector:p2'],
      });
      mocks.jsonGet
        .mockResolvedValueOnce([{ id: 'p1', vector: [], payload: {} }])
        .mockRejectedValueOnce(new Error('fail'));

      const result = await wrapper.scanPoints('mycoll');
      expect(result.points).toHaveLength(1);
    });

    it('should handle JSON.GET returning null', async () => {
      mocks.scan.mockResolvedValueOnce({
        cursor: '0',
        keys: ['vector:p1'],
      });
      mocks.jsonGet.mockResolvedValueOnce(null);

      const result = await wrapper.scanPoints('mycoll');
      expect(result.points).toHaveLength(0);
    });

    it('should use fallbacks for missing data properties', async () => {
      mocks.scan.mockResolvedValueOnce({
        cursor: '0',
        keys: ['vector:orphan'],
      });
      mocks.jsonGet.mockResolvedValueOnce([{}]);

      const result = await wrapper.scanPoints('mycoll');
      expect(result.points).toHaveLength(1);
      expect(result.points[0].id).toBe('orphan');
      expect(result.points[0].vector).toEqual([]);
      expect(result.points[0].payload).toEqual({});
    });

    it('should use default prefix when not configured', async () => {
      const noPrefix = new RedisVectorClientWrapper({
        url: 'redis://localhost:6379',
        indexName: 'testidx',
        vectorDimension: 1536,
      });
      await noPrefix.initialize();
      vi.clearAllMocks();

      mocks.scan.mockResolvedValueOnce({ cursor: '0', keys: ['vector:k1'] });
      mocks.jsonGet.mockResolvedValueOnce([{ id: 'k1', vector: [], payload: {} }]);

      const result = await noPrefix.scanPoints('mycoll');
      expect(result.points).toHaveLength(1);
      expect(mocks.scan).toHaveBeenCalledWith('0', { MATCH: 'vector:*', COUNT: 100 });
    });
  });

  describe('ensureInitialized', () => {
    it('should throw on search before init', async () => {
      const uut = new RedisVectorClientWrapper(validConfig);
      await expect(uut.search({ vector: [0.1], topK: 5 })).rejects.toThrow('not initialized');
    });

    it('should throw on upsertPoint before init', async () => {
      const uut = new RedisVectorClientWrapper(validConfig);
      await expect(uut.upsertPoint({ id: 'p1', vector: [0.1], payload: {} })).rejects.toThrow(
        'not initialized',
      );
    });

    it('should throw on upsertBatch before init', async () => {
      const uut = new RedisVectorClientWrapper(validConfig);
      await expect(uut.upsertBatch([])).rejects.toThrow('not initialized');
    });

    it('should throw on deleteCollection before init', async () => {
      const uut = new RedisVectorClientWrapper(validConfig);
      await expect(uut.deleteCollection('x')).rejects.toThrow('not initialized');
    });

    it('should throw on scanPoints before init', async () => {
      const uut = new RedisVectorClientWrapper(validConfig);
      await expect(uut.scanPoints('x')).rejects.toThrow('not initialized');
    });

    it('should return null on getCollectionInfo before init (caught internally)', async () => {
      const uut = new RedisVectorClientWrapper(validConfig);
      const info = await uut.getCollectionInfo('x');
      expect(info).toBeNull();
    });
  });

  describe('buildRedisFilter', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('$eq', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $eq: 'val' } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('@payload_f:{val}');
    });

    it('$ne', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $ne: 'val' } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('-@payload_f:{val}');
    });

    it('$in', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $in: ['a', 'b'] } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('@payload_f:{a|b}');
    });

    it('$nin', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $nin: ['a', 'b'] } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('-@payload_f:{a|b}');
    });

    it('$gt', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $gt: 10 } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('@payload_f:[(10 inf]');
    });

    it('$gte', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $gte: 10 } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('@payload_f:[10 inf]');
    });

    it('$lt', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $lt: 10 } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('@payload_f:[-inf (10]');
    });

    it('$lte', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $lte: 10 } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('@payload_f:[-inf 10]');
    });

    it('$exists true', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $exists: true } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('@payload_f:*');
    });

    it('$exists false', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({ vector: [0.1], topK: 5, filter: { f: { $exists: false } } });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('-@payload_f:*');
    });

    it('$and', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({
        vector: [0.1],
        topK: 5,
        filter: { $and: [{ a: 'x' }, { b: 'y' }] },
      });
      const query = mocks.ftSearch.mock.calls[0][1];
      expect(query).toContain('@payload_a:{x}');
      expect(query).toContain('@payload_b:{y}');
    });

    it('$or', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({
        vector: [0.1],
        topK: 5,
        filter: { $or: [{ a: 'x' }, { b: 'y' }] },
      });
      const query = mocks.ftSearch.mock.calls[0][1];
      expect(query).toContain('(@payload_a:{x}) | (@payload_b:{y})');
    });

    it('null value maps to negation', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({
        vector: [0.1],
        topK: 5,
        filter: { field: null },
      });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('-@payload_field:*');
    });

    it('direct value maps to tag match', async () => {
      mocks.ftSearch.mockResolvedValueOnce({ documents: [] });
      await wrapper.search({
        vector: [0.1],
        topK: 5,
        filter: { field: 'direct' },
      });
      expect(mocks.ftSearch.mock.calls[0][1]).toContain('@payload_field:{direct}');
    });
  });
});
