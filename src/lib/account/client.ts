import { accountApi } from "@/config/account";
import { storageKeys } from "@/config/storage";
import { safeSetLocalStorage } from "@/lib/storage/safe-storage";

export interface AccountAvatar {
  kind: "character";
  id: number;
}

export interface AccountUser {
  /** Stable Passport partition. Older API deployments may omit it. */
  id?: string;
  name: string | null;
  username: string | null;
  picture: string | null;
  /** Avatar picked on the site; null means "use picture". */
  avatar: AccountAvatar | null;
}

export type AccountState =
  | { status: "signed-in"; user: AccountUser }
  | { status: "signed-out" }
  /** No account API here: a static preview, `astro dev` without starmoe-api, or the API is down. */
  | { status: "unavailable" };

let pending: Promise<AccountState> | undefined;
const listeners = new Set<(state: AccountState) => void>();

/** Calls back whenever the account changes on this page, e.g. after a new avatar was saved. */
export function subscribeAccount(listener: (state: AccountState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(state: AccountState): void {
  pending = Promise.resolve(rememberAccountState(state));
  for (const listener of listeners) listener(state);
}

/**
 * Records the answer for the next page load. The drawer's account row is in the server markup, so the first paint
 * needs to know which row to show: `src/lib/account/bootstrap.ts` reads this before paint and renders the cached
 * name into the row, and a deployment without the account API hides the row instead of showing a sign-in link that
 * then disappears.
 */
function rememberAccountState(state: AccountState): AccountState {
  const record = state.status === "signed-in"
    ? { status: state.status, name: state.user.name ?? state.user.username ?? "" }
    : { status: state.status };
  safeSetLocalStorage(storageKeys.accountState, JSON.stringify(record));
  if (typeof document !== "undefined") document.documentElement.dataset.account = state.status;
  return state;
}

/** The signed-in user, fetched once per page load. Signing in or out always reloads the page. */
export function loadAccount(): Promise<AccountState> {
  pending ??= fetch(accountApi.me, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } })
    .then(async (response): Promise<AccountState> => {
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return { status: "unavailable" };
      const body = (await response.json()) as { user?: AccountUser | null };
      return body.user ? { status: "signed-in", user: body.user } : { status: "signed-out" };
    })
    .catch((): AccountState => ({ status: "unavailable" }))
    .then(rememberAccountState);
  return pending;
}

/** Re-check a shared-cookie account change; a cloud response never supplies the new identity itself. */
export async function refreshAccount(): Promise<AccountState> {
  pending = undefined;
  const request = loadAccount();
  const state = await request;
  if (pending === request) publish(state);
  return state;
}

/** Stores the avatar choice (null goes back to the passport picture) and tells every subscriber. */
export async function saveAvatar(avatar: AccountAvatar | null): Promise<AccountUser> {
  const response = await fetch(accountApi.avatar, {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ avatar }),
  });
  if (!response.ok) throw new Error(`saving the avatar failed (${response.status})`);
  const body = (await response.json()) as { user: AccountUser };
  publish({ status: "signed-in", user: body.user });
  return body.user;
}
