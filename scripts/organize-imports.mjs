import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const languages = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript'
};

async function collectFiles(directory, recursive) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && recursive && entry.name !== 'node_modules') {
      files.push(...(await collectFiles(path, true)));
    } else if (entry.isFile() && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function applyEdits(source, edits) {
  const lineStarts = [0];
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    lineStarts.push(match.index + match[0].length);
  }
  const newline = source.match(/\r\n|\r|\n/)?.[0] ?? '\n';
  const offset = ({ line, character }) => {
    const start = lineStarts[line];
    const end = lineStarts[line + 1] ?? source.length;
    const length = source.slice(start, end).replace(/[\r\n]+$/, '').length;
    if (
      !Number.isInteger(line) ||
      !Number.isInteger(character) ||
      start === undefined ||
      character < 0 ||
      character > length
    ) {
      throw new Error('TypeScript returned an invalid edit position.');
    }
    // LSP uses UTF-16 positions, matching JavaScript string offsets.
    return start + character;
  };
  const replacements = edits
    .map((edit) => ({
      start: offset(edit.range.start),
      end: offset(edit.range.end),
      text: edit.newText.replace(/\r\n|\r|\n/g, newline)
    }))
    .sort((a, b) => b.start - a.start || b.end - a.end);
  let boundary = source.length;
  let result = source;
  for (const edit of replacements) {
    if (edit.end < edit.start || edit.end > boundary) {
      throw new Error('TypeScript returned overlapping or reversed edits.');
    }
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    boundary = edit.start;
  }
  return result;
}

async function organize(files) {
  const server = spawn(
    process.execPath,
    [join(root, 'node_modules/typescript/bin/tsc'), '--lsp', '--stdio'],
    { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const pending = new Map();
  let nextId = 0;
  let buffer = Buffer.alloc(0);
  let stderr = '';
  let failure;
  let closed = false;
  const fail = (error) => {
    failure ??= error;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(failure);
    }
    pending.clear();
  };
  const completion = new Promise((resolve) => {
    server.once('close', (code, signal) => {
      closed = true;
      fail(new Error(`TypeScript exited (${signal ?? code}). ${stderr.trim()}`));
      resolve({ code, signal });
    });
  });
  server.on('error', fail);
  server.stdin.on('error', fail);
  server.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  const send = (message) => {
    if (failure) throw failure;
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
    server.stdin.write(
      Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body])
    );
  };
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`TypeScript request timed out: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      try {
        send({ id, method, ...(params === undefined ? {} : { params }) });
      } catch (error) {
        fail(error);
      }
    });
  server.stdout.on('data', (chunk) => {
    try {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = buffer.subarray(0, headerEnd).toString();
        const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1]);
        if (!Number.isSafeInteger(length) || length < 0) {
          throw new Error('Invalid TypeScript response header.');
        }
        const end = headerEnd + 4 + length;
        if (buffer.length < end) return;
        const message = JSON.parse(buffer.subarray(headerEnd + 4, end).toString());
        buffer = buffer.subarray(end);
        if (message.method) {
          if (message.id !== undefined) {
            if (message.method === 'workspace/configuration') {
              send({ id: message.id, result: message.params.items.map(() => ({})) });
            } else if (
              message.method === 'client/registerCapability' ||
              message.method === 'client/unregisterCapability'
            ) {
              // This session only reads snapshots; writes happen after it closes.
              // Accept watch registrations without starting persistent file watchers.
              send({ id: message.id, result: null });
            } else {
              send({
                id: message.id,
                error: { code: -32601, message: `Unsupported request: ${message.method}` }
              });
            }
          }
        } else {
          const response = pending.get(message.id);
          if (!response) continue;
          pending.delete(message.id);
          clearTimeout(response.timer);
          if (message.error) {
            response.reject(new Error(`${message.error.code}: ${message.error.message}`));
          } else {
            response.resolve(message.result);
          }
        }
      }
    } catch (error) {
      fail(error);
    }
  });

  const changed = [];
  try {
    const rootUri = pathToFileURL(root).href;
    const initialized = await request('initialize', {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: 'repository' }],
      capabilities: {
        general: { positionEncodings: ['utf-16'] },
        workspace: {
          configuration: true,
          didChangeWatchedFiles: { dynamicRegistration: true }
        },
        textDocument: {
          codeAction: {
            codeActionLiteralSupport: { codeActionKind: { valueSet: ['source.organizeImports'] } },
            resolveSupport: { properties: ['edit'] }
          }
        }
      }
    });
    if ((initialized.capabilities.positionEncoding ?? 'utf-16') !== 'utf-16') {
      throw new Error('TypeScript did not select UTF-16 positions.');
    }
    send({ method: 'initialized', params: {} });
    for (const path of files) {
      const source = await readFile(path, 'utf8');
      const uri = pathToFileURL(path).href;
      const languageId = languages[path.slice(path.lastIndexOf('.'))];
      send({
        method: 'textDocument/didOpen',
        params: { textDocument: { uri, languageId, version: 1, text: source } }
      });
      const actions = await request('textDocument/codeAction', {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        context: { diagnostics: [], only: ['source.organizeImports'], triggerKind: 1 }
      });
      let action = actions?.find((candidate) => candidate.kind === 'source.organizeImports');
      if (action?.disabled) throw new Error(action.disabled.reason);
      if (action && !action.edit) action = await request('codeAction/resolve', action);
      const edits = [];
      for (const [target, changes] of Object.entries(action?.edit?.changes ?? {})) {
        if (target !== uri) throw new Error('TypeScript attempted to edit another file.');
        edits.push(...changes);
      }
      for (const change of action?.edit?.documentChanges ?? []) {
        if (change.textDocument?.uri !== uri) {
          throw new Error('TypeScript attempted an unsupported workspace edit.');
        }
        edits.push(...change.edits);
      }
      if (action?.command) throw new Error('TypeScript returned an unsupported command.');
      const formatted = applyEdits(source, edits);
      if (formatted !== source) changed.push({ path, source, formatted });
      send({ method: 'textDocument/didClose', params: { textDocument: { uri } } });
    }
    await request('shutdown');
    // TypeScript 7.0.2 reports "context canceled" for an exit notification.
    // EOF after the shutdown response closes the server cleanly instead.
    server.stdin.end();
    const timeout = setTimeout(() => server.kill('SIGKILL'), 3000);
    const outcome = await completion;
    clearTimeout(timeout);
    if (outcome.code !== 0) {
      throw new Error(`TypeScript shutdown failed. ${stderr.trim()}`);
    }
    return changed;
  } finally {
    for (const request of pending.values()) clearTimeout(request.timer);
    if (!closed) {
      server.stdin.end();
      const timeout = setTimeout(() => server.kill('SIGKILL'), 3000);
      await completion;
      clearTimeout(timeout);
    }
  }
}

try {
  if (process.argv.slice(2).some((argument) => argument !== '--check')) {
    throw new Error('Usage: node scripts/organize-imports.mjs [--check]');
  }
  const files = await collectFiles(root, false);
  for (const directory of ['src', 'tests', 'scripts']) {
    files.push(...(await collectFiles(join(root, directory), true)));
  }
  const changed = await organize(files.sort());
  if (!check) {
    // Check every snapshot before writing so a concurrent save is not overwritten.
    for (const file of changed) {
      if ((await readFile(file.path, 'utf8')) !== file.source) {
        throw new Error(`File changed during import organization: ${relative(root, file.path)}`);
      }
    }
    for (const file of changed) await writeFile(file.path, file.formatted);
  }
  for (const file of changed) {
    console.log(
      `${check ? 'Unorganized imports' : 'Organized imports'}: ${relative(root, file.path)}`
    );
  }
  if (check && changed.length > 0) process.exitCode = 1;
  if (changed.length === 0) console.log('Imports are organized.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
