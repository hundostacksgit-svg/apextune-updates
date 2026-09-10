/* Transitions and one-click effects, applied to the selection or to everything. */

import { $, $$, esc, toast, empty } from '../ui.js';
import { S, actions } from '../main.js';
import { TRANSITION_LIST } from '../engine/transitions.js';
import { clipsOn } from '../engine/project.js';
import * as licence from '../licence.js';

const QUICK = [
  { id: 'fade-ends', name: 'Fade in &amp; out', icon: '◑', tier: 'free',
    hint: 'Half a second at each end of the timeline.' },
  { id: 'auto-transitions', name: 'Dissolve every cut', icon: '◐', tier: 'free',
    hint: 'A short cross dissolve on every join.' },
  { id: 'mirror', name: 'Mirror', icon: '⇋', tier: 'free',
    hint: 'Flips the picture horizontally.' },
  { id: 'shake', name: 'Camera shake', icon: '≈', tier: 'creator',
    hint: 'A subtle handheld wobble, keyframed.' },
  { id: 'punch-in', name: 'Punch in', icon: '⤢', tier: 'creator',
    hint: 'Slow zoom across the whole clip.' },
  { id: 'strobe', name: 'Strobe', icon: '⚡', tier: 'creator',
    hint: 'Rapid opacity flicker for a beat drop.' },
];

export function mount(host) {
  const sel = [...S.sel];
  const target = sel.length ? `${sel.length} selected clip${sel.length === 1 ? '' : 's'}` : 'every clip';

  host.innerHTML = `
    <div class="panel-h"><h2>Effects</h2></div>
    <p class="panel-sub">Applies to ${esc(target)}.</p>

    <h4 style="font-size:12px;margin:0 0 8px;color:var(--text-2)">Transitions</h4>
    <p class="tiny muted" style="margin:0 0 10px">Sets the transition <em>into</em> the selected clips.</p>
    <div class="chips" id="fx-trans">
      ${TRANSITION_LIST.map((t) => {
        const locked = !licence.can(t.tier === 'free' ? 'transitions' : 'all-filters');
        return `<button class="chip ${locked ? 'locked' : ''}" data-trans="${esc(t.id)}"
          data-tier="${esc(t.tier)}" title="${esc(t.name)}">${t.icon} ${esc(t.name)}</button>`;
      }).join('')}
    </div>

    <h4 style="font-size:12px;margin:20px 0 8px;color:var(--text-2)">One-click</h4>
    <div class="chips" id="fx-quick">
      ${QUICK.map((q) => {
        const locked = q.tier !== 'free' && !licence.can('all-filters');
        return `<button class="chip ${locked ? 'locked' : ''}" data-quick="${esc(q.id)}"
          data-tier="${esc(q.tier)}" title="${esc(q.hint.replace(/&amp;/g, '&'))}">${q.icon} ${q.name}</button>`;
      }).join('')}
    </div>

    ${S.project.clips.length ? '' : empty('🎛', 'Nothing to apply this to yet',
      'Put a clip on the timeline first.')}`;

  $('#fx-trans', host).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-trans]');
    if (!btn) return;
    const feature = btn.dataset.tier === 'free' ? 'transitions' : 'all-filters';
    licence.gate(feature, () => applyTransition(btn.dataset.trans), { what: 'That transition' });
  });

  $('#fx-quick', host).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick]');
    if (!btn) return;
    const feature = btn.dataset.tier === 'free' ? 'transitions' : 'all-filters';
    licence.gate(feature, () => runQuick(btn.dataset.quick), { what: 'That effect' });
  });

  void $$;
}

function targets() {
  return S.sel.size
    ? S.project.clips.filter((c) => S.sel.has(c.id))
    : S.project.clips.filter((c) => {
      const track = S.project.tracks.find((t) => t.id === c.trackId);
      return track?.kind === 'video';
    });
}

function applyTransition(type) {
  let count = 0;
  for (const track of S.project.tracks.filter((t) => t.kind === 'video')) {
    const list = clipsOn(S.project, track.id);
    list.forEach((clip, i) => {
      if (i === 0) return;
      if (S.sel.size && !S.sel.has(clip.id)) return;
      const room = Math.min(clip.dur, list[i - 1].dur) / 3;
      clip.transitionIn = { type, dur: Math.min(0.4, room) };
      count++;
    });
  }
  if (!count) { toast('No cuts to put a transition on'); return; }
  actions.commit(`Transition: ${type}`);
  toast(`${count} transition${count === 1 ? '' : 's'} set`, 'ok');
}

function runQuick(id) {
  const list = targets();
  if (!list.length) { toast('Nothing on the timeline yet'); return; }

  switch (id) {
    case 'fade-ends': {
      const sorted = [...list].sort((a, b) => a.start - b.start);
      sorted[0].fadeIn = Math.min(0.5, sorted[0].dur / 2);
      sorted.at(-1).fadeOut = Math.min(0.5, sorted.at(-1).dur / 2);
      actions.commit('Fade in and out');
      break;
    }
    case 'auto-transitions':
      applyTransition('dissolve');
      return;
    case 'mirror':
      for (const c of list) c.transform.rotate = c.transform.rotate === 180 ? 0 : 180;
      actions.commit('Mirror');
      break;
    case 'shake':
      for (const c of list) {
        // Six keyframes is enough to read as handheld without looking periodic.
        for (let i = 0; i <= 6; i++) {
          const t = (c.dur / 6) * i;
          c.keyframes['transform.x'] ||= [];
          c.keyframes['transform.y'] ||= [];
          c.keyframes['transform.x'].push({ t, v: (Math.random() - 0.5) * 0.012, ease: 'ease' });
          c.keyframes['transform.y'].push({ t, v: (Math.random() - 0.5) * 0.012, ease: 'ease' });
        }
        c.transform.scale = Math.max(c.transform.scale, 1.03);   // hide the edges
      }
      actions.commit('Camera shake');
      break;
    case 'punch-in':
      for (const c of list) {
        c.keyframes['transform.scale'] = [
          { t: 0, v: 1, ease: 'linear' },
          { t: c.dur, v: 1.16, ease: 'linear' },
        ];
      }
      actions.commit('Punch in');
      break;
    case 'strobe':
      for (const c of list) {
        const keys = [];
        for (let t = 0; t < c.dur; t += 0.12) {
          keys.push({ t, v: keys.length % 2 ? 0.15 : 1, ease: 'hold' });
        }
        c.keyframes['transform.opacity'] = keys;
      }
      actions.commit('Strobe');
      break;
    default:
      return;
  }
  toast('Applied', 'ok');
}
