// sw/log.js - tiny logger utilities

const DEBUG = true;

export function log(...args) {
  try {
    if (DEBUG) console.log('[Fscore]', ...args);
  } catch {}
}

export function err(e, ctx = '') {
  try { console.error('[Fscore][ERR]' + (ctx ? '[' + ctx + ']' : ''), e); } catch {}
}
