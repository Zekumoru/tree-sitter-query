import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const workspaces: string[] = [];
const source = [
  '/* 🦀 imports */',
  "import { resolve } from 'node:path'; // Path helper.",
  "import { writeFileSync, readFileSync } from 'node:fs';",
  "import { existsSync } from 'node:fs';",
  "import type { PathLike } from 'node:fs';",
  "import './setup.js'; // Side effect.",
  '',
  'export const api = [readFileSync, existsSync, resolve];',
  'export type FilePath = PathLike;',
  "export const marker = '😀';",
  ''
].join('\n');

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), 'scm-organize-imports-'));
  workspaces.push(workspace);
  for (const directory of ['src', 'tests/fixtures', 'scripts', 'dist', '.build', '.vscode-test']) {
    await mkdir(join(workspace, directory), { recursive: true });
  }
  await copyFile(
    resolve('scripts/organize-imports.mjs'),
    join(workspace, 'scripts/organize-imports.mjs')
  );
  await writeFile(join(workspace, 'package.json'), '{"type":"module"}');
  await writeFile(
    join(workspace, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'NodeNext', strict: true },
      include: ['src/**/*.ts']
    })
  );
  return workspace;
}

async function runOrganizer(workspace: string, check = false) {
  try {
    const result = await execute(
      process.execPath,
      [join(workspace, 'scripts/organize-imports.mjs'), ...(check ? ['--check'] : [])],
      { cwd: workspace, timeout: 20000 }
    );
    return { code: 0, ...result };
  } catch (error) {
    const failure = error as Error & { code: number; stdout: string; stderr: string };
    if (typeof failure.code !== 'number') throw error;
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    await rm(workspace, { recursive: true, force: true });
  }
});

describe('native import organizer', () => {
  it('checks without writing, organizes imports, and remains idempotent within its scope', async () => {
    const workspace = await createWorkspace();
    await symlink(resolve('node_modules'), join(workspace, 'node_modules'), 'junction');
    const originals = new Map([
      ['src/lf.ts', source],
      ['src/crlf.ts', source.replaceAll('\n', '\r\n')],
      [
        'rollup.config.mjs',
        source
          .replace('export type FilePath = PathLike;\n', '')
          .replace("import type { PathLike } from 'node:fs';\n", '')
      ],
      ['tests/fixtures/imports.scm', '; fixture  \r\n(node)@capture\r\n'],
      ['dist/generated.ts', source],
      ['.build/generated.ts', source],
      ['.vscode-test/generated.ts', source]
    ]);
    for (const [path, text] of originals) await writeFile(join(workspace, path), text);

    const check = await runOrganizer(workspace, true);
    expect(check.code).toBe(1);
    expect(check.stderr).toBe('');
    expect(check.stdout).toContain('Unorganized imports: src/lf.ts');
    expect(check.stdout).toContain('Unorganized imports: rollup.config.mjs');
    for (const [path, text] of originals) {
      expect(await readFile(join(workspace, path), 'utf8')).toBe(text);
    }

    const organized = await runOrganizer(workspace);
    expect(organized.code).toBe(0);
    expect(organized.stderr).toBe('');
    const lf = await readFile(join(workspace, 'src/lf.ts'), 'utf8');
    const crlf = await readFile(join(workspace, 'src/crlf.ts'), 'utf8');
    expect(lf).toContain("import { existsSync, readFileSync } from 'node:fs';");
    expect(lf).not.toContain('writeFileSync');
    expect(lf).toContain("import type { PathLike } from 'node:fs';");
    expect(lf).toContain("import './setup.js'; // Side effect.");
    expect(lf).toContain("import { resolve } from 'node:path'; // Path helper.");
    expect(lf).toContain('/* 🦀 imports */');
    expect(lf).toContain("export const marker = '😀';");
    expect(lf).not.toContain('\r');
    expect(crlf).toBe(lf.replaceAll('\n', '\r\n'));
    expect(await readFile(join(workspace, 'rollup.config.mjs'), 'utf8')).not.toContain(
      'writeFileSync'
    );
    const snapshots = new Map<string, string>();
    for (const path of originals.keys()) {
      const formatted = await readFile(join(workspace, path), 'utf8');
      snapshots.set(path, formatted);
    }
    const preserved = [...originals].filter(
      ([path]) => !path.startsWith('src/') && path !== 'rollup.config.mjs'
    );
    for (const [path, text] of preserved) expect(snapshots.get(path)).toBe(text);
    expect((await runOrganizer(workspace, true)).code).toBe(0);
    expect((await runOrganizer(workspace)).code).toBe(0);
    for (const [path, text] of snapshots) {
      expect(await readFile(join(workspace, path), 'utf8')).toBe(text);
    }
  });

  it('fails without changing files when TypeScript cannot start', async () => {
    const workspace = await createWorkspace();
    const path = join(workspace, 'src/example.ts');
    await writeFile(path, source);
    const result = await runOrganizer(workspace);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('TypeScript exited');
    expect(await readFile(path, 'utf8')).toBe(source);
  });
});
