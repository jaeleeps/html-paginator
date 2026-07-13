import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index';

describe('html-paginator', () => {
  it('exports a version', () => {
    expect(VERSION).toBeTruthy();
  });
});
