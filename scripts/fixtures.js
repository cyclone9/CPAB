// SPDX-License-Identifier: GPL-3.0-or-later
// Serves test/fixtures/ on port 8733 for browser checks. Usage: npm run fixtures
// Any other path gets an empty answer of the right kind, so a check can point a blocked domain here
// through Chrome's host resolver and never depend on the real server.
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8733;
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function fixtureFile(pathname) {
  const path = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  if (!path.startsWith(root)) return null;
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

const server = createServer((request, response) => {
  const { pathname, searchParams } = new URL(request.url, 'http://fixtures.localhost');
  const headers = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
  // A strict page, to prove the stored CSS still lands on one.
  if (searchParams.has('csp')) headers['content-security-policy'] = "style-src 'none'";
  const file = fixtureFile(pathname);
  const type = TYPES[extname(pathname)];
  if (file) {
    response.writeHead(200, { ...headers, 'content-type': type ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  } else if (type) {
    response.writeHead(200, { ...headers, 'content-type': type });
    response.end();
  } else {
    response.writeHead(200, { ...headers, 'content-type': 'image/gif' });
    response.end(PIXEL);
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`fixtures on http://fixtures.localhost:${PORT}/`));
