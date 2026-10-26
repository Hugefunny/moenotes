/**
 * Navigation group folding (the drawer's collapsible sections).
 *
 * The stored map records what the reader folded. A group opens once when its page is entered from outside it — see
 * `resolveNavGroupEntry` — and every other fold stays exactly where the reader left it.
 */

export type NavGroupCollapsed = Record<string, boolean>;

export interface NavGroupEntry {
  /** The folds to render after this page load. */
  collapsed: NavGroupCollapsed;
  /** Whether `collapsed` differs from what was stored, so the caller persists it and later pages agree. */
  persist: boolean;
  /** The group to remember for the next navigation; `null` clears the record. */
  nextPreviousGroupId: string | null;
}

/** Parses the stored folds, tolerating missing, foreign or hand-edited data. */
export function parseCollapsedGroups(raw: string | null): NavGroupCollapsed {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    // `Object.fromEntries` defines own properties, so a hand-edited `__proto__` key cannot change the prototype;
    // real group ids never use it, so it is dropped rather than carried in the map.
    const entries = Object.entries(parsed).filter((entry): entry is [string, boolean] => entry[0] !== "__proto__" && typeof entry[1] === "boolean");
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

/** Opens the group the current page belongs to, leaving every other fold untouched. */
export function expandActiveGroup(collapsed: NavGroupCollapsed, activeGroupId: string | undefined): NavGroupCollapsed {
  if (!activeGroupId || !collapsed[activeGroupId]) return collapsed;
  return { ...collapsed, [activeGroupId]: false };
}

/** Flips one group; a group that was never stored starts expanded, so its first click folds it. */
export function toggleCollapsedGroup(collapsed: NavGroupCollapsed, groupId: string): NavGroupCollapsed {
  return { ...collapsed, [groupId]: !collapsed[groupId] };
}

/**
 * Decides the folds for this page load. A group opens only when its page is entered from outside it: the previous
 * page belonged to another group (or to none). Moving between pages of the same group, or reloading one, keeps the
 * reader's folds exactly as stored.
 */
export function resolveNavGroupEntry(
  saved: NavGroupCollapsed,
  activeGroupId: string | undefined,
  previousGroupId: string | null,
): NavGroupEntry {
  const entering = Boolean(activeGroupId) && previousGroupId !== activeGroupId;
  const collapsed = entering ? expandActiveGroup(saved, activeGroupId) : saved;
  return {
    collapsed,
    persist: collapsed !== saved,
    nextPreviousGroupId: activeGroupId ?? null,
  };
}
