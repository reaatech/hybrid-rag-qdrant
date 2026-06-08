import { describe, expect, it } from 'vitest';
import { standardFilterSchema } from './schemas.js';

const validFilterCases = [
  ['simple equality', { department: 'engineering' }],
  ['null equality', { deletedAt: null }],
  ['boolean equality', { published: true }],
  ['string array value', { tags: ['rag', 'search'] }],
  ['number array value', { shard: [1, 2, 3] }],
  ['explicit eq', { department: { $eq: 'engineering' } }],
  ['not equal', { status: { $ne: 'archived' } }],
  ['in string list', { department: { $in: ['engineering', 'support'] } }],
  ['not in number list', { priority: { $nin: [0, 1] } }],
  ['greater than', { score: { $gt: 0.2 } }],
  ['greater than or equal', { score: { $gte: 0.2 } }],
  ['less than', { score: { $lt: 0.9 } }],
  ['less than or equal', { score: { $lte: 0.9 } }],
  ['exists true', { tenantId: { $exists: true } }],
  ['exists false', { tenantId: { $exists: false } }],
  ['and', { $and: [{ tenantId: 't1' }, { status: 'active' }] }],
  ['or', { $or: [{ department: 'engineering' }, { department: 'support' }] }],
  [
    'nested logical',
    {
      $and: [
        { tenantId: 't1' },
        { $or: [{ department: 'engineering' }, { priority: { $gte: 5 } }] },
      ],
    },
  ],
] as const;

const invalidFilterCases = [
  ['unsupported operator', { department: { $contains: 'eng' } }],
  ['range operator with string', { score: { $gt: 'high' } }],
  ['exists with non-boolean', { tenantId: { $exists: 'yes' } }],
  ['in with boolean values', { published: { $in: [true, false] } }],
  ['logical and with non-array', { $and: { status: 'active' } }],
  ['dollar-prefixed key with scalar value', { $custom: 'value' }],
] as const;

describe('standardFilterSchema semantics matrix', () => {
  it.each(validFilterCases)('accepts %s', (_name, filter) => {
    expect(standardFilterSchema.safeParse(filter).success).toBe(true);
  });

  it.each(invalidFilterCases)('rejects %s', (_name, filter) => {
    expect(standardFilterSchema.safeParse(filter).success).toBe(false);
  });
});
