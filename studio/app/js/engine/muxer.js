/*
 * A fragmented MP4 muxer.
 *
 * WebCodecs hands back encoded chunks; something has to wrap them in a
 * container. This writes fragmented MP4 (ftyp + moov, then moof/mdat pairs),
 * which is the simplest correct MP4 to produce in one pass — no seeking back
 * to patch a sample table, so it streams and it cannot be left half-written.
 *
 * Supports avc1 (H.264), hvc1 (HEVC), vp09 and av01 for video, and mp4a (AAC)
 * for audio. Everything is big-endian, sizes include their own 4-byte length,
 * and every box here is one the spec requires — there is no decoration.
 *
 * If you are reading this to fix a file that will not play: the usual causes
 * are a missing codec-private box (avcC/hvcC), a timescale mismatch between
 * mvhd and mdhd, or a trun whose data offset does not point at the first byte
 * of mdat's payload. All three are handled below and all three are worth
 * checking first.
 */

/* ------------------------------------------------------------------ */
/* box writing                                                         */
/* ------------------------------------------------------------------ */

const text = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

function u32(v) {
  return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
}
function u16(v) {
  return new Uint8Array([(v >>> 8) & 255, v & 255]);
}
function u64(v) {
  const hi = Math.floor(v / 2 ** 32);
  return new Uint8Array([...u32(hi), ...u32(v >>> 0)]);
}

function box(type, ...payload) {
  const parts = payload.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const length = parts.reduce((n, p) => n + p.length, 8);
  const out = new Uint8Array(length);
  out.set(u32(length), 0);
  out.set(text(type), 4);
  let at = 8;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** A full box carries a version byte and 24 bits of flags before its payload. */
function fullBox(type, version, flags, ...payload) {
  return box(type, new Uint8Array([version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255]), ...payload);
}

function concat(chunks) {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/* ------------------------------------------------------------------ */
/* sample descriptions                                                 */
/* ------------------------------------------------------------------ */

const ZERO = (n) => new Uint8Array(n);

function visualSampleEntry(format, { width, height, codecPrivate, codecBox }) {
  return box(format,
    ZERO(6), u16(1),                       // reserved, data_reference_index
    u16(0), u16(0), ZERO(12),              // pre_defined, reserved
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000),      // 72dpi horiz/vert resolution
    u32(0), u16(1),                        // reserved, frame_count
    ZERO(32),                              // compressor name
    u16(0x0018), u16(0xffff),              // depth, pre_defined
    codecPrivate ? box(codecBox, codecPrivate) : new Uint8Array(0));
}

function audioSampleEntry({ channels, sampleRate, codecPrivate }) {
  // esds wraps the AudioSpecificConfig AAC decoders need. The nested
  // descriptor tags are fixed-shape; the only variable is the config length.
  const asc = codecPrivate || new Uint8Array([0x12, 0x10]);
  const decSpecific = concat([new Uint8Array([0x05, asc.length]), asc]);
  const decConfig = concat([
    new Uint8Array([0x04, 13 + decSpecific.length, 0x40, 0x15]),  // MPEG-4 audio
    ZERO(3), u32(0), u32(0),
    decSpecific,
  ]);
  const es = concat([
    new Uint8Array([0x03, 3 + decConfig.length + 3, 0x00, 0x01, 0x00]),
    decConfig,
    new Uint8Array([0x06, 0x01, 0x02]),
  ]);

  return box('mp4a',
    ZERO(6), u16(1),
    ZERO(8),
    u16(channels), u16(16),
    u16(0), u16(0),
    u32(sampleRate << 16),
    fullBox('esds', 0, 0, es));
}

/* ------------------------------------------------------------------ */
/* the muxer                                                           */
/* ------------------------------------------------------------------ */

const TIMESCALE = 90000;          // 90kHz: divides cleanly for 24/25/30/50/60

export class Mp4Muxer {
  /**
   * `video` and `audio` describe the tracks. Audio may be omitted entirely,
   * which is the normal case for a silent timeline.
   */
  constructor({ video, audio }) {
    this.video = video ? { ...video, id: 1, timescale: TIMESCALE, samples: [], baseTime: 0 } : null;
    this.audio = audio ? { ...audio, id: 2, timescale: audio.sampleRate, samples: [], baseTime: 0 } : null;
    this.chunks = [];
    this.sequence = 1;
    this.headerWritten = false;
  }

  /** Codec-private data arrives with the first encoded chunk, not before it. */
  setVideoDescription(description) {
    if (this.video && description) this.video.codecPrivate = new Uint8Array(description);
  }
  setAudioDescription(description) {
    if (this.audio && description) this.audio.codecPrivate = new Uint8Array(description);
  }

  addVideo(chunk) {
    if (!this.video) return;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.video.samples.push({
      data,
      // WebCodecs timestamps are microseconds.
      time: (chunk.timestamp / 1e6) * TIMESCALE,
      duration: ((chunk.duration || 0) / 1e6) * TIMESCALE,
      key: chunk.type === 'key',
    });
    this._maybeFlush();
  }

  addAudio(chunk) {
    if (!this.audio) return;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.audio.samples.push({
      data,
      time: (chunk.timestamp / 1e6) * this.audio.timescale,
      duration: ((chunk.duration || 0) / 1e6) * this.audio.timescale,
      key: true,
    });
    this._maybeFlush();
  }

  /* Fragments are written every 60 video samples — roughly two seconds, which
     keeps memory flat on a long export without producing thousands of tiny
     moof boxes. */
  _maybeFlush() {
    if (!this.headerWritten) {
      if (this.video && !this.video.codecPrivate && this.video.needsPrivate) return;
      this._writeHeader();
    }
    const enough = (this.video?.samples.length || 0) >= 60
      || (!this.video && (this.audio?.samples.length || 0) >= 100);
    if (enough) this._writeFragment();
  }

  _writeHeader() {
    this.headerWritten = true;
    this.chunks.push(box('ftyp',
      text('isom'), u32(0x200),
      text('isom'), text('iso2'), text('avc1'), text('mp41')));
    this.chunks.push(this._moov());
  }

  _moov() {
    const tracks = [];
    if (this.video) tracks.push(this._trak(this.video, 'vide'));
    if (this.audio) tracks.push(this._trak(this.audio, 'soun'));

    const trex = [];
    if (this.video) trex.push(fullBox('trex', 0, 0, u32(1), u32(1), u32(0), u32(0), u32(0)));
    if (this.audio) trex.push(fullBox('trex', 0, 0, u32(2), u32(1), u32(0), u32(0), u32(0)));

    return box('moov',
      // duration 0 with a 64-bit-capable mvhd: fragmented files declare their
      // length in the fragments, not up front.
      fullBox('mvhd', 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(0),
        u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0),
        u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0),
        u32(0), u32(0), u32(0x40000000),
        ZERO(24), u32(3)),
      ...tracks,
      box('mvex', ...trex));
  }

  _trak(track, handler) {
    const isVideo = handler === 'vide';
    const sampleEntry = isVideo
      ? visualSampleEntry(track.format, {
        width: track.width, height: track.height,
        codecPrivate: track.codecPrivate, codecBox: track.codecBox,
      })
      : audioSampleEntry({
        channels: track.channels, sampleRate: track.sampleRate, codecPrivate: track.codecPrivate,
      });

    return box('trak',
      fullBox('tkhd', 0, 3, u32(0), u32(0), u32(track.id), u32(0), u32(0),
        u32(0), u32(0), u16(0), u16(0), u16(isVideo ? 0 : 0x0100), u16(0),
        u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0),
        u32(0), u32(0), u32(0x40000000),
        u32(isVideo ? track.width << 16 : 0), u32(isVideo ? track.height << 16 : 0)),
      box('mdia',
        fullBox('mdhd', 0, 0, u32(0), u32(0), u32(track.timescale), u32(0), u16(0x55c4), u16(0)),
        fullBox('hdlr', 0, 0, u32(0), text(handler), ZERO(12),
          text(isVideo ? 'VideoHandler\0' : 'SoundHandler\0')),
        box('minf',
          isVideo ? box('vmhd', new Uint8Array([0, 0, 0, 1]), ZERO(8))
            : box('smhd', new Uint8Array([0, 0, 0, 0]), ZERO(4)),
          box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
          box('stbl',
            fullBox('stsd', 0, 0, u32(1), sampleEntry),
            // Empty sample tables: everything lives in the fragments.
            fullBox('stts', 0, 0, u32(0)),
            fullBox('stsc', 0, 0, u32(0)),
            fullBox('stsz', 0, 0, u32(0), u32(0)),
            fullBox('stco', 0, 0, u32(0))))));
  }

  _writeFragment() {
    const tracks = [this.video, this.audio].filter((t) => t && t.samples.length);
    if (!tracks.length) return;

    // Two passes: the trun's data offset has to point past the whole moof, so
    // the moof is built once to measure it and once with the real number.
    const build = (offsets) => {
      const trafs = tracks.map((track, i) => {
        const samples = track.samples;
        const defaultDur = Math.round(track.timescale / (track.rate || 30));
        const entries = concat(samples.map((s, idx) => {
          const dur = Math.round(s.duration || (idx + 1 < samples.length
            ? samples[idx + 1].time - s.time
            : defaultDur));
          return concat([
            u32(Math.max(1, dur)),
            u32(s.data.length),
            // Non-key samples are marked non-sync so players seek correctly.
            u32(s.key ? 0x02000000 : 0x01010000),
          ]);
        }));
        return box('traf',
          fullBox('tfhd', 0, 0x020000, u32(track.id)),   // default-base-is-moof
          fullBox('tfdt', 1, 0, u64(Math.round(track.baseTime))),
          fullBox('trun', 0, 0x000701, u32(samples.length), u32(offsets[i] || 0), entries));
      });
      return box('moof', fullBox('mfhd', 0, 0, u32(this.sequence)), ...trafs);
    };

    const probe = build(tracks.map(() => 0));
    let offset = probe.length + 8;               // + mdat header
    const offsets = tracks.map((track) => {
      const at = offset;
      offset += track.samples.reduce((n, s) => n + s.data.length, 0);
      return at;
    });

    const moof = build(offsets);
    const payload = concat(tracks.flatMap((t) => t.samples.map((s) => s.data)));

    this.chunks.push(moof, box('mdat', payload));
    this.sequence++;

    for (const track of tracks) {
      const last = track.samples.at(-1);
      const defaultDur = Math.round(track.timescale / (track.rate || 30));
      track.baseTime = last.time + (last.duration || defaultDur);
      track.samples = [];
    }
  }

  /** Finish and hand back the file. */
  finish() {
    if (!this.headerWritten) this._writeHeader();
    this._writeFragment();
    return new Blob(this.chunks, { type: 'video/mp4' });
  }
}

/**
 * Which codec box a format needs. Getting this wrong is the difference between
 * a file that plays and one that shows a black rectangle.
 */
export const CODEC_BOX = {
  avc1: 'avcC',
  hvc1: 'hvcC',
  hev1: 'hvcC',
  vp09: 'vpcC',
  av01: 'av1C',
};

/** Turn a WebCodecs codec string into the MP4 four-character format. */
export function formatFor(codec) {
  if (codec.startsWith('avc1') || codec.startsWith('avc3')) return 'avc1';
  if (codec.startsWith('hvc1') || codec.startsWith('hev1')) return 'hvc1';
  if (codec.startsWith('vp09')) return 'vp09';
  if (codec.startsWith('av01')) return 'av01';
  return null;
}
