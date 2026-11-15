// serve.js — throwaway static server for local verification of the landing page.
// Copyright (c) 2026 0xnothings
// Usage: node serve.js [port] [file]
//
// Read the file BEFORE writing headers. The previous version called
// writeHead(200) first, so a missing asset (favicon) threw during readFileSync
// and the catch tried to write a second set of headers — ERR_HTTP_HEADERS_SENT.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 8791;
const entry = process.argv[3] || 'index-v2.html';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const name = req.url === '/' ? entry : decodeURIComponent(req.url).replace(/^\/+/, '');
  let body;
  try {
    body = readFileSync(join(HERE, name));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const ext = name.slice(name.lastIndexOf('.'));
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' });
  res.end(body);
}).listen(port, () => console.log(`serving ${entry} on http://127.0.0.1:${port}/`));
