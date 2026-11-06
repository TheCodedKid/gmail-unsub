// Gmail page helpers for the unsubscribe sweep.
// Paste the whole file into the Gmail tab with javascript_tool (action: javascript_exec).
// They live on window, so paste again after any page reload.
// Every helper verifies what it is about to click and never clicks Block or
// "Go to website" on its own. Only __blockFromSubs blocks, and only call it when
// the person has asked for blocking.

// Visible dialogs that mention unsubscribe or block.
window.__dialogs = () => [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')]
  .filter(d => d.offsetParent !== null && /unsubscribe|block/i.test(d.textContent));

// Find the row on Manage subscriptions (#sub) whose address matches exactly, and return its Unsubscribe button.
window.__rowButton = (email) => {
  const leaf = [...document.querySelectorAll('[role="main"] *')]
    .find(el => el.children.length === 0 && el.textContent.trim().toLowerCase() === email.toLowerCase());
  if (!leaf) return null;
  let row = leaf, btn = null;
  for (let i = 0; i < 8 && row; i++) {
    row = row.parentElement;
    btn = row && [...row.querySelectorAll('button,[role=button]')]
      .find(b => /unsubscribe/i.test(b.getAttribute('aria-label') || b.textContent));
    if (btn) break;
  }
  return btn;
};

// Unsubscribe one sender from the Manage subscriptions page.
// Returns {status}: unsubscribed | not_on_page | no_button | no_dialog |
//   needs_manual_dialog_open (the website-only dialog is left open; close it with a REAL Escape keypress) |
//   blocked_by_open_dialog (some dialog is still open; press Escape or reload).
window.__unsub = async (email) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (__dialogs().length) return { email, status: 'blocked_by_open_dialog' };
  if (!document.querySelector('[role="main"]')) return { email, status: 'no_main' };
  const btn = __rowButton(email);
  if (btn === null) {
    const onPage = [...document.querySelectorAll('[role="main"] *')].some(el => el.children.length === 0 && el.textContent.trim().toLowerCase() === email.toLowerCase());
    return { email, status: onPage ? 'no_button' : 'not_on_page' };
  }
  btn.click();
  let dlg = null;
  for (let i = 0; i < 20; i++) { await sleep(150); dlg = __dialogs().find(d => d.textContent.toLowerCase().includes(email.toLowerCase())); if (dlg) break; }
  if (!dlg) return { email, status: 'no_dialog' };
  const text = dlg.innerText.replace(/\s+/g, ' ').trim();
  const ok = [...dlg.querySelectorAll('button,[role=button]')].find(b => b.innerText.trim() === 'Unsubscribe');
  if (/stop getting messages/i.test(text) && !/go to their website/i.test(text) && ok) {
    ok.click(); await sleep(1500);
    return { email, status: 'unsubscribed' };
  }
  return { email, status: 'needs_manual_dialog_open', text };
};

// Run a queue of addresses within a time budget (stay under the 45 s tool timeout).
// Stops early when a dialog needs a real Escape keypress. Call it again to continue.
// Usage: window.__queue = [...]; window.__results = []; await __runQueue(38000)
window.__runQueue = async (budgetMs = 38000) => {
  const t0 = Date.now();
  while (window.__queue.length && Date.now() - t0 < budgetMs) {
    const o = await __unsub(window.__queue.shift());
    window.__results.push(o);
    if (o.status.startsWith('needs_manual') || o.status.startsWith('blocked')) break;
  }
  return window.__results.map(o => `${o.email} → ${o.status}${o.status !== 'unsubscribed' && o.text ? ' | ' + o.text.slice(0, 100) : ''}`).join('\n') + `\nleft: ${window.__queue.length}`;
};

// Every sender address currently listed on #sub (lowercased).
window.__listSubs = () => {
  const lines = document.querySelector('[role="main"]').innerText.split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) if (/@/.test(lines[i]) && /emails recently/.test(lines[i + 1] || '')) out.push(lines[i].toLowerCase());
  return out;
};

// Confirm a Gmail unsubscribe dialog opened from inside an email.
window.__confirmDlg = async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let dlg = null;
  for (let i = 0; i < 20; i++) { dlg = __dialogs()[0]; if (dlg) break; await sleep(150); }
  if (!dlg) return { status: 'no_dialog' };
  const text = dlg.innerText.replace(/\s+/g, ' ').trim();
  const btns = [...dlg.querySelectorAll('button,[role=button]')];
  const ok = btns.find(b => b.innerText.trim() === 'Unsubscribe');
  if (/stop getting messages/i.test(text) && !/go to their website/i.test(text) && ok) { ok.click(); await sleep(1500); return { status: 'unsubscribed', text }; }
  const cancel = btns.find(b => /^cancel$/i.test(b.innerText.trim()));
  if (cancel) cancel.click();
  return { status: cancel ? 'needs_manual' : 'needs_manual_dialog_open', text };
};

// Fallback for a sender not on #sub: open one of its threads and use Gmail's header Unsubscribe link.
// Waits until the expected sender's address is on screen, so it never acts on a stale page.
window.__doMsg = async (threadId, email) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  location.hash = '#all/' + threadId;
  let ok = false;
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    const m = document.querySelector('[role="main"]');
    if (m && [...m.querySelectorAll('[email]')].some(e => e.getAttribute('email').toLowerCase() === email.toLowerCase() && e.offsetParent !== null)) { ok = true; break; }
  }
  if (!ok) return email + ' → page_not_loaded';
  await sleep(500);
  const main = document.querySelector('[role="main"]');
  if (/You unsubscribed from/i.test(main.innerText)) return email + ' → already_unsubscribed';
  const link = [...main.querySelectorAll('span,a,[role=link]')]
    .find(el => el.offsetParent !== null && el.children.length === 0 && el.textContent.trim() === 'Unsubscribe' && !el.closest('.a3s'));
  if (!link) return email + ' → no_gmail_unsub_button';
  link.click();
  const r = await __confirmDlg();
  return email + ' → ' + r.status + (r.status === 'unsubscribed' ? '' : ' | ' + (r.text || ''));
};

// Block a sender from #sub with "Block instead". ONLY when the person asked to block.
// Verify afterwards at #settings/filters (do a location.reload() first).
window.__blockFromSubs = async (email) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const btn = __rowButton(email);
  if (!btn) return email + ' → not_on_page';
  btn.click(); await sleep(1200);
  const dlg = __dialogs().find(d => d.textContent.toLowerCase().includes(email.toLowerCase()));
  if (!dlg) return email + ' → no_dialog';
  const b = [...dlg.querySelectorAll('button,[role=button]')].find(x => x.innerText.trim() === 'Block instead');
  if (!b) return email + ' → no_block_button';
  b.click(); await sleep(1500);
  return email + ' → blocked';
};

// On a #search/... results page: select each page and move it to Trash until the search is empty.
// For Archive instead, change the selector '[aria-label="Delete"]' to '[aria-label="Archive"]'.
window.__trashLoop = async (maxMs = 35000) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const t0 = Date.now(); let total = 0, rounds = 0;
  while (Date.now() - t0 < maxMs) {
    const main = document.querySelector('[role="main"]');
    const rows = [...main.querySelectorAll('tr.zA')].filter(r => r.offsetParent !== null);
    if (!rows.length) return { total, rounds, done: true };
    const sel = [...main.querySelectorAll('[role="checkbox"]')].find(c => c.offsetParent !== null && !c.closest('tr'));
    if (sel.getAttribute('aria-checked') !== 'true') sel.click();
    await sleep(500);
    const checked = rows.filter(r => r.querySelector('[role="checkbox"][aria-checked="true"]')).length;
    const del = [...document.querySelectorAll('[aria-label="Delete"][role="button"], [data-tooltip="Delete"]')].find(b => b.offsetParent !== null);
    if (!del) return { total, rounds, error: 'no delete button' };
    ['mousedown', 'mouseup', 'click'].forEach(t => del.dispatchEvent(new MouseEvent(t, { bubbles: true })));
    total += checked; rounds++;
    await sleep(3500);
  }
  return { total, rounds, done: false };
};

'gmail helpers loaded';
