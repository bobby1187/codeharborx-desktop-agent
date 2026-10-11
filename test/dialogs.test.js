const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDialogs } = require('../src/dialogs');
function fixture() {
  const handlers = new Map(); const windows = [];
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new EventEmitter(); this.webContents.id = windows.length + 1; this.webContents.mainFrame = {}; this.webContents.setWindowOpenHandler = fn => { this.blockPopup = fn; }; this.dead = false; windows.push(this); }
    isDestroyed() { return this.dead; }
    destroy() { this.dead = true; this.emit('closed'); }
    loadFile() { return Promise.resolve(); }
    show() {}
  }
  const dialogs = createDialogs({ BrowserWindow: Window, ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) } });
  const event = win => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
  return { dialogs, handlers, windows, event };
}
test('confirmation receives theme and content only from its owning window', async () => {
  const { dialogs, handlers, windows, event } = fixture();
  const promise = dialogs.confirm({}, { theme: 'light', title: 'Delete example?', detail: 'Moves to Recycle Bin.' });
  const win = windows[0];
  assert.equal(win.options.modal, true); assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.equal(handlers.get('dialog:details')(event(win)).theme, 'light');
  assert.throws(() => handlers.get('dialog:details')({ sender: { id: 99 } }));
  handlers.get('dialog:answer')({ ...event(win), senderFrame: {} }, true);
  assert.equal(win.dead, false);
  handlers.get('dialog:answer')(event(win), false); assert.equal(await promise, false);
});
test('closing a dialog cancels safely and rejects stale answers', async () => {
  const { dialogs, handlers, windows, event } = fixture();
  const promise = dialogs.confirm(null, { theme: 'dark' }); const win = windows[0];
  win.destroy(); assert.equal(await promise, false);
  handlers.get('dialog:answer')(event(win), true);
  assert.throws(() => handlers.get('dialog:details')(event(win)));
});
test('only an explicit true confirmation allows deletion', async () => {
  const { dialogs, handlers, windows, event } = fixture();
  let promise = dialogs.confirm(null, {}); handlers.get('dialog:answer')(event(windows[0]), 'true'); assert.equal(await promise, false);
  promise = dialogs.confirm(null, {}); handlers.get('dialog:answer')(event(windows[1]), true); assert.equal(await promise, true);
});
