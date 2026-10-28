import { storageKeys } from "@/config/storage";

/**
 * Runs in the head before the first paint, on the routes that register a filter sheet (`filterTitleKey`). The button
 * is in the server markup now, but whether the sheet it opens is already open is stored in session storage; this
 * hides the button from the first frame instead of showing it only for the sheet to replace it once the island has
 * registered its filters.
 *
 * The docked sheet's own width (--mn-filter-offset) is not applied here: the sheet itself only exists once the page's
 * filters are registered, so applying the offset first would leave an empty column beside the content.
 */
export function buildFilterBootstrapScript(hasFilters: boolean): string {
  if (!hasFilters) return "";
  return `
(function(){
  try {
    var pref = sessionStorage.getItem(${JSON.stringify(storageKeys.filterDrawerOpen)});
    var open = pref === null ? window.matchMedia('(min-width: 1600px)').matches : pref === 'true';
    document.documentElement.dataset.filterOpen = open ? 'true' : 'false';
  } catch(e) {}
})();`;
}
