// @vitest-environment node
/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the published tarball contents. Uses `npm pack --dry-run` with
 * scripts disabled, so it lists what `files` would ship without building.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as {
  main: string;
  module: string;
  types: string;
  exports: Record<string, string | Record<string, string>>;
};

function packedFiles(): string[] {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
  });
  const [result] = JSON.parse(out) as [{ files: { path: string }[] }];
  return result.files.map((f) => f.path);
}

/** Every file path referenced by main/module/types/exports. */
function entryPoints(): string[] {
  const targets = Object.values(pkg.exports).flatMap((value) =>
    typeof value === 'string' ? [value] : Object.values(value),
  );
  return [pkg.main, pkg.module, pkg.types, ...targets].map((p) => p.replace(/^\.\//, ''));
}

describe('npm package contents', () => {
  const files = packedFiles();

  it('excludes tests, sources and config', () => {
    const leaked = files.filter(
      (f) =>
        f.startsWith('test/') ||
        f.startsWith('src/') ||
        f.startsWith('examples/') ||
        /\.test\.[cm]?[jt]s$/.test(f) ||
        /^(tsconfig|vitest\.config)\./.test(f),
    );
    expect(leaked).toEqual([]);
  });

  it('ships only dist plus package metadata', () => {
    const allowed = new Set(['package.json', 'README.md', 'LICENSE']);
    expect(files.filter((f) => !f.startsWith('dist/') && !allowed.has(f))).toEqual([]);
    expect(files).toContain('LICENSE');
  });

  it('points every entry point into dist', () => {
    expect(entryPoints().filter((p) => !p.startsWith('dist/'))).toEqual([]);
  });
});
