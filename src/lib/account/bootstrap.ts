import { storageKeys } from "@/config/storage";

/**
 * Runs in the head before the first paint. The drawer's account row is part of the server markup, but which row is
 * right — sign-in or the signed-in user — is only known to `/api/me`, which answers after the first paint. The last
 * answer is recorded (src/lib/account/client.ts), so the first paint can already show the reader's own row: a
 * signed-in reader used to see "sign in" flash and then their avatar on every page load.
 *
 * The name and initial travel as custom properties, not text: the row stays React's markup, and a pseudo-element
 * renders the cached name until the component replaces it with the real one (`data-account-resolved`). That keeps
 * hydration exact while the row still reads correctly from the first frame.
 *
 * A deployment without the account API (a static preview, `astro dev` without starmoe-api) records `unavailable`,
 * and this hides the row so the sign-in link never shows up only to disappear.
 */
export function buildAccountBootstrapScript(): string {
  return `
(function(){
  try {
    var raw = localStorage.getItem(${JSON.stringify(storageKeys.accountState)});
    if (!raw) return;
    var record = JSON.parse(raw);
    if (!record || typeof record !== 'object') return;
    var root = document.documentElement;
    if (record.status === 'unavailable') {
      root.dataset.account = 'unavailable';
      return;
    }
    if (record.status !== 'signed-in') return;
    root.dataset.account = 'signed-in';
    var name = typeof record.name === 'string' ? record.name.replace(/[\\u0000-\\u001f]/g, ' ').trim() : '';
    if (!name) return;
    root.style.setProperty('--mn-account-name', JSON.stringify(name));
    var initial = Array.from(name)[0];
    root.style.setProperty('--mn-account-initial', JSON.stringify(initial ? initial.toUpperCase() : '?'));
  } catch(e) {}
})();`;
}
