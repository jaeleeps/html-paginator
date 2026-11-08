import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index';
import pkg from '../package.json';

describe('html-paginator', () => {
  it('exports the package version', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
