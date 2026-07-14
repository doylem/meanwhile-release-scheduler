import { describe, expect, it } from 'vitest';
import { applyTaskCompletion } from '../src/lib/taskCompletion';

describe('applyTaskCompletion', () => {
  it('adds a task id when marking done', () => {
    expect(applyTaskCompletion(undefined, 'a', true)).toEqual(['a']);
  });

  it('is idempotent when the task is already done', () => {
    expect(applyTaskCompletion(['a'], 'a', true)).toEqual(['a']);
  });

  it('removes a task id when marking not done', () => {
    expect(applyTaskCompletion(['a', 'b'], 'a', false)).toEqual(['b']);
  });

  it('no-ops when removing a task id that is not present', () => {
    expect(applyTaskCompletion(['b'], 'a', false)).toEqual(['b']);
  });

  it('leaves other completed task ids untouched', () => {
    expect(applyTaskCompletion(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
  });
});
