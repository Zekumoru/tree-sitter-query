import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const workspace = resolve('.vscode-test/workspace');
await mkdir(resolve(workspace, '.vscode'), { recursive: true });
await writeFile(
  resolve(workspace, '.vscode/settings.json'),
  JSON.stringify({
    '[tree-sitter-query]': {
      'editor.defaultFormatter': 'zekumoru.tree-sitter-query',
      'editor.formatOnSave': true,
      'editor.insertSpaces': true,
      'editor.tabSize': 2,
      'editor.detectIndentation': false
    }
  })
);

await runTests({
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
  extensionDevelopmentPath: resolve('.'),
  extensionTestsPath: resolve('tests/vscode.cjs'),
  launchArgs: [
    workspace,
    '--disable-extensions',
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--user-data-dir',
    resolve('.vscode-test/user-data'),
    '--extensions-dir',
    resolve('.vscode-test/extensions')
  ]
});
