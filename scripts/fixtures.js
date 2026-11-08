// SPDX-License-Identifier: GPL-3.0-or-later
// Serves test/fixtures/ on port 8733 for browser checks. Usage: npm run fixtures [-- --data <folder>]
// Any other path gets an empty answer of the right kind, so a check can point a blocked domain here
// through Chrome's host resolver and never depend on the real server.
//   --data <folder>  also serve a scripts/publish-data.js output (its data/v1, or the folder itself) at
//                    /data/v1/, logging each request there, for list-update checks. When the folder holds
//                    several outputs, /data-switch/<name> serves <folder>/<name> from then on
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const PORT = 8733;
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const DATA_PATH = '/data/v1/';

const { values } = parseArgs({ options: { data: { type: 'string' } } });
const dataFolder = (folder) => (existsSync(join(folder, 'data/v1/version.json')) ? resolve(folder, 'data/v1') : resolve(folder));
let dataRoot = values.data ? dataFolder(values.data) : null;

function fileUnder(base, pathname) {
  const path = normalize(join(base, pathname));
  if (path !== base && !path.startsWith(base + sep)) return null;
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

const fixtureFile = (pathname) => fileUnder(root, pathname === '/' ? 'index.html' : pathname);

function serveData(request, response, pathname) {
  console.log(`data request: ${request.method} ${pathname}${request.url.includes('?') ? ' (with a query)' : ''}`);
  const file = fileUnder(dataRoot, pathname.slice(DATA_PATH.length));
  if (!file) {
    response.writeHead(404, { 'cache-control': 'no-store' });
    response.end();
    return;
  }
  response.writeHead(200, { 'cache-control': 'no-store', 'content-type': TYPES[extname(file)] ?? 'text/plain; charset=utf-8' });
  response.end(readFileSync(file));
}

const server = createServer((request, response) => {
  const { pathname, searchParams } = new URL(request.url, 'http://fixtures.localhost');
  if (dataRoot && pathname.startsWith(DATA_PATH)) {
    serveData(request, response, pathname);
    return;
  }
  const name = dataRoot && pathname.match(/^\/data-switch\/([A-Za-z0-9-]+)$/)?.[1];
  if (name && existsSync(join(values.data, name))) {
    dataRoot = dataFolder(join(values.data, name));
    console.log(`data switched to ${name}`);
    response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' });
    response.end(`serving ${name}\n`);
    return;
  }
  const headers = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
  // A strict page, to prove the stored CSS still lands on one.
  if (searchParams.has('csp')) headers['content-security-policy'] = "style-src 'none'";
  const file = fixtureFile(pathname);
  const type = TYPES[extname(pathname)];
  if (pathname === '/redirect') {
    response.writeHead(302, { ...headers, location: searchParams.get('to') });
    response.end();
  } else if (file) {
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

server.listen(PORT, '127.0.0.1', () => console.log(`fixtures on http://fixtures.localhost:${PORT}/${dataRoot ? `, list data at ${DATA_PATH}` : ''}`));
