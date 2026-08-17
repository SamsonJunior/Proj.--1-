// Minimal request-body parsing: JSON / urlencoded bodies, and
// multipart/form-data (for design image uploads) — all with zero
// external dependencies.
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

function collectBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseUrlEncodedOrJson(req) {
  const buf = await collectBuffer(req);
  const contentType = req.headers['content-type'] || '';
  const text = buf.toString('utf8');
  if (contentType.includes('application/json')) {
    return text ? JSON.parse(text) : {};
  }
  const params = new URLSearchParams(text);
  return Object.fromEntries(params.entries());
}

// Parses multipart/form-data. Returns { fields, files } where files is
// [{ fieldName, filename, mimeType, buffer }].
async function parseMultipart(req) {
  const contentType = req.headers['content-type'] || '';
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error('No multipart boundary found');
  const boundary = '--' + (match[1] || match[2]);
  const buf = await collectBuffer(req);

  const boundaryBuf = Buffer.from(boundary);
  const parts = [];
  let start = buf.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buf.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    // slice out this part, trimming the leading \r\n and trailing \r\n
    let partBuf = buf.slice(start + boundaryBuf.length, next);
    if (partBuf.slice(0, 2).toString() === '\r\n') partBuf = partBuf.slice(2);
    if (partBuf.slice(-2).toString() === '\r\n') partBuf = partBuf.slice(0, -2);
    if (partBuf.length && partBuf.toString() !== '--') parts.push(partBuf);
    start = next;
  }

  const fields = {};
  const files = [];

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerText = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + 4);

    const nameMatch = headerText.match(/name="([^"]+)"/);
    const filenameMatch = headerText.match(/filename="([^"]*)"/);
    const fieldName = nameMatch ? nameMatch[1] : null;
    if (!fieldName) continue;

    if (filenameMatch && filenameMatch[1]) {
      const typeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
      files.push({
        fieldName,
        filename: filenameMatch[1],
        mimeType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
        buffer: body,
      });
    } else {
      fields[fieldName] = body.toString('utf8');
    }
  }

  return { fields, files };
}

// Saves an uploaded file buffer to public/uploads and returns its web path.
function saveUploadedFile(file, uploadsDir) {
  const ext = path.extname(file.filename) || '.jpg';
  const safeName = `${randomUUID()}${ext}`;
  const destPath = path.join(uploadsDir, safeName);
  fs.writeFileSync(destPath, file.buffer);
  return `/uploads/${safeName}`;
}

module.exports = { parseUrlEncodedOrJson, parseMultipart, saveUploadedFile };
