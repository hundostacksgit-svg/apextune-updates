/*
 * Project bundles.
 *
 * A .omnidx project file is portable JSON, which moves between machines — but
 * only if the footage is already on the other machine. A bundle is that file
 * plus every clip it uses, in one archive, so a project genuinely moves from a
 * laptop to a phone or to somebody else and opens with nothing missing.
 *
 * The archive is a plain ZIP written by hand, stored (not deflated). Video is
 * already compressed, so deflate would spend minutes to save nothing, and
 * "stored" means any unzip tool on earth can open it — including the ones
 * built into Windows, macOS, iOS and Android. Someone who never installs
 * OmniDx can still get their footage back out, which matters more than a few
 * per cent of size.
 */

import { blobOf, rehydrate } from './media.js';
import { serialize, deserialize } from './project.js';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

/* ------------------------------------------------------------------ */
/* CRC-32                                                              */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ */
/* writing                                                             */
/* ------------------------------------------------------------------ */

function writer(size) {
  const view = new DataView(new ArrayBuffer(size));
  let at = 0;
  return {
    u16(v) { view.setUint16(at, v, true); at += 2; },
    u32(v) { view.setUint32(at, v >>> 0, true); at += 4; },
    bytes(b) { new Uint8Array(view.buffer).set(b, at); at += b.length; },
    done() { return new Uint8Array(view.buffer, 0, at); },
    get at() { return at; },
  };
}

const utf8 = (s) => new TextEncoder().encode(s);

/**
 * Build the bundle.
 *
 * `onProgress` reports each file as it goes in, because a bundle of a real
 * project is hundreds of megabytes and a silent spinner for two minutes is
 * indistinguishable from a hang.
 */
export async function pack(project, { onProgress } = {}) {
  const entries = [];

  // The project itself, first, so a partially-downloaded bundle still shows
  // what it was meant to contain.
  entries.push({ name: 'project.omnidx.json', data: utf8(serialize(project)) });

  const used = new Set(project.clips.map((c) => c.mediaId).filter(Boolean));
  const media = project.media.filter((m) => used.has(m.id));

  let done = 0;
  for (const item of media) {
    onProgress?.({ phase: 'packing', name: item.name, done, total: media.length });
    // eslint-disable-next-line no-await-in-loop -- files are read one at a time
    if (!blobOf(item)) await rehydrate(item);
    const blob = blobOf(item);
    if (!blob) continue;
    // Named by hash, because two clips can share a filename and the project
    // refers to content, not to names.
    // eslint-disable-next-line no-await-in-loop
    const bytes = new Uint8Array(await blob.arrayBuffer());
    entries.push({ name: `media/${item.hash}${extensionOf(item.name)}`, data: bytes });
    done++;
  }

  entries.push({
    name: 'README.txt',
    data: utf8(`This is an OmniDx Studio project bundle.

Open it in OmniDx Studio — Settings → Projects → Open a file — and everything
comes back exactly as it was: the timeline, every effect, and the footage.

It is also an ordinary ZIP. Rename it to .zip and your computer will open it.
Inside, project.omnidx.json is the edit in readable form, and media/ holds the
original files, named by content rather than by filename.

Nothing here is locked to us. If OmniDx Studio disappeared tomorrow you would
still have your footage and a readable description of the edit.
`),
  });

  onProgress?.({ phase: 'writing', done: media.length, total: media.length });
  return zip(entries);
}

function extensionOf(name) {
  const match = /\.[a-z0-9]{1,5}$/i.exec(name || '');
  return match ? match[0].toLowerCase() : '';
}

function zip(entries) {
  const prepared = entries.map((e) => {
    const name = utf8(e.name);
    return { ...e, nameBytes: name, crc: crc32(e.data) };
  });

  const localSize = prepared.reduce((n, e) => n + 30 + e.nameBytes.length + e.data.length, 0);
  const centralSize = prepared.reduce((n, e) => n + 46 + e.nameBytes.length, 0);
  const out = writer(localSize + centralSize + 22);

  const offsets = [];
  for (const entry of prepared) {
    offsets.push(out.at);
    out.u32(SIG_LOCAL);
    out.u16(20);            // version needed
    out.u16(0);             // flags
    out.u16(0);             // method: stored
    out.u16(0); out.u16(0); // time, date
    out.u32(entry.crc);
    out.u32(entry.data.length);
    out.u32(entry.data.length);
    out.u16(entry.nameBytes.length);
    out.u16(0);
    out.bytes(entry.nameBytes);
    out.bytes(entry.data);
  }

  const centralStart = out.at;
  prepared.forEach((entry, i) => {
    out.u32(SIG_CENTRAL);
    out.u16(20); out.u16(20);
    out.u16(0); out.u16(0);
    out.u16(0); out.u16(0);
    out.u32(entry.crc);
    out.u32(entry.data.length);
    out.u32(entry.data.length);
    out.u16(entry.nameBytes.length);
    out.u16(0); out.u16(0); out.u16(0); out.u16(0);
    out.u32(0);
    out.u32(offsets[i]);
    out.bytes(entry.nameBytes);
  });

  out.u32(SIG_END);
  out.u16(0); out.u16(0);
  out.u16(prepared.length); out.u16(prepared.length);
  out.u32(out.at - centralStart);
  out.u32(centralStart);
  out.u16(0);

  return new Blob([out.done()], { type: 'application/zip' });
}

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

/**
 * Open a bundle. Returns the project and its media as Files, ready to import.
 * Reads the central directory rather than scanning for local headers, so a
 * bundle written by any zip tool opens too.
 */
export async function unpack(blob, { onProgress } = {}) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);

  // The end-of-directory record is at the end, after a comment of unknown
  // length, so it is found by scanning backwards for its signature.
  let end = -1;
  for (let at = bytes.length - 22; at >= 0 && at > bytes.length - 66000; at--) {
    if (view.getUint32(at, true) === SIG_END) { end = at; break; }
  }
  if (end < 0) throw new Error('That file is not a project bundle.');

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);

  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== SIG_CENTRAL) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));

    if (method !== 0) {
      throw new Error(`"${name}" is compressed, and this reader only handles stored entries. `
        + 'Unzip it yourself and open project.omnidx.json instead.');
    }

    const localNameLen = view.getUint16(localAt + 26, true);
    const localExtraLen = view.getUint16(localAt + 28, true);
    const from = localAt + 30 + localNameLen + localExtraLen;
    files.set(name, bytes.subarray(from, from + size));

    at += 46 + nameLen + extraLen + commentLen;
    onProgress?.({ phase: 'reading', done: i + 1, total: count });
  }

  const projectBytes = files.get('project.omnidx.json');
  if (!projectBytes) throw new Error('That bundle has no project in it.');
  const project = deserialize(new TextDecoder().decode(projectBytes));

  const media = [];
  for (const [name, data] of files) {
    if (!name.startsWith('media/')) continue;
    const hash = name.slice(6).replace(/\.[^.]*$/, '');
    const original = project.media.find((m) => m.hash === hash);
    media.push({
      hash,
      file: new File([data], original?.name || name.slice(6), { type: original?.type || '' }),
    });
  }

  return { project, media };
}

export function bundleName(project) {
  const base = String(project.name || 'project')
    .replace(/[^\w\s.-]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'project';
  return `${base}.omnidxpkg`;
}
