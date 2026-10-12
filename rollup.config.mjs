import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export default {
  input: '.build/extension.js',
  external: ['vscode'],
  output: { file: 'dist/extension.cjs', format: 'cjs', sourcemap: true },
  watch: { exclude: '.build/**' },
  plugins: [{
    // TypeScript 7 has a CLI, but no stable compiler API for the older plugins.
    name: 'typescript-cli',
    buildStart() {
      for (const file of readdirSync('src')) {
        if (file.endsWith('.ts')) this.addWatchFile(resolve('src', file));
      }
      this.addWatchFile(resolve('tsconfig.json'));
      this.addWatchFile(resolve('tsconfig.build.json'));
      execFileSync(process.execPath, [
        resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'
      ], { stdio: 'inherit' });
    }
  }]
};
