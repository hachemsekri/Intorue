/**
 * What the quote popup needs to know, kept apart from the forms:
 *  - a request was submitted: never show the popup again on this browser;
 *  - the page's form has a phone number in it: don't interrupt.
 */
const DONE_KEY = 'intorue.quote.submitted';
const SESSION_KEY = 'intorue.quote.session';

let submittedHere = false;
let pageFormStarted = false;
const listeners = new Set<() => void>();

function read(store: 'local' | 'session', key: string): string | null {
  try {
    return (store === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null; // storage blocked: the page still works, for this visit only
  }
}
function write(store: 'local' | 'session', key: string) {
  try {
    (store === 'local' ? window.localStorage : window.sessionStorage).setItem(key, '1');
  } catch {
    /* see read() */
  }
}

export const requestSubmitted = () => submittedHere || read('local', DONE_KEY) === '1';

export function markRequestSubmitted() {
  submittedHere = true;
  write('local', DONE_KEY);
  listeners.forEach((l) => l());
}

export function onRequestSubmitted(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const setPageFormStarted = (v: boolean) => {
  pageFormStarted = v;
};
export const isPageFormStarted = () => pageFormStarted;

let firstOpen: boolean | null = null;
/** True on the first page open of a browser session; a reload in the same session is not. */
export function isFirstOpenOfSession(): boolean {
  if (firstOpen === null) {
    firstOpen = read('session', SESSION_KEY) !== '1';
    write('session', SESSION_KEY);
  }
  return firstOpen;
}
