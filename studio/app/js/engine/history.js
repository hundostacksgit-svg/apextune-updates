/*
 * Undo.
 *
 * Snapshot-based, deliberately. A command-based stack is smaller in memory but
 * every editor that uses one eventually has a bug where some code path forgets
 * to record its inverse, and the user's undo silently skips a step. A project
 * document is a few hundred KB of JSON at worst, so we keep whole copies and
 * the stack can never be wrong.
 *
 * Every entry is named, which is what makes the history panel possible: you
 * can see what each step did and jump straight back to it.
 */

const LIMIT = 300;

export class History {
  constructor(initial, label = 'New project') {
    this.stack = [{ label, at: Date.now(), doc: structuredClone(initial) }];
    this.index = 0;
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this); }

  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }
  get current() { return this.stack[this.index].doc; }
  get entries() { return this.stack.map((e, i) => ({ ...e, index: i, active: i === this.index })); }

  /**
   * Record a new state. Anything after the current point is discarded, which
   * is what every editor does and what people expect.
   *
   * `coalesceKey` merges rapid repeats of the same gesture — dragging a slider
   * should be one undo step, not two hundred.
   */
  push(doc, label, coalesceKey = null) {
    const top = this.stack[this.index];
    if (coalesceKey && top && top.coalesceKey === coalesceKey && Date.now() - top.at < 1200) {
      top.doc = structuredClone(doc);
      top.at = Date.now();
      top.label = label;
      this._emit();
      return;
    }
    this.stack.length = this.index + 1;
    this.stack.push({ label, at: Date.now(), coalesceKey, doc: structuredClone(doc) });
    if (this.stack.length > LIMIT) this.stack.shift();
    this.index = this.stack.length - 1;
    this._emit();
  }

  undo() {
    if (!this.canUndo) return null;
    this.index--;
    this._emit();
    return structuredClone(this.current);
  }

  redo() {
    if (!this.canRedo) return null;
    this.index++;
    this._emit();
    return structuredClone(this.current);
  }

  /** Jump to any point in the stack — the history panel's whole job. */
  goTo(i) {
    if (i < 0 || i >= this.stack.length) return null;
    this.index = i;
    this._emit();
    return structuredClone(this.current);
  }

  /** What undo would say it's about to undo, for the tooltip. */
  get undoLabel() { return this.canUndo ? this.stack[this.index].label : null; }
  get redoLabel() { return this.canRedo ? this.stack[this.index + 1].label : null; }

  reset(doc, label = 'Opened project') {
    this.stack = [{ label, at: Date.now(), doc: structuredClone(doc) }];
    this.index = 0;
    this._emit();
  }
}
