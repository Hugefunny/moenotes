/**
 * Some embedded WebViews expose matchMedia() with only addListener/removeListener. Our settings/filter stores and
 * MUI's media-query/reduced-motion hooks use the EventTarget API; a throw while importing a shared store prevents
 * the islands from hydrating, leaving the server-rendered menu/settings buttons inert.
 *
 * Run this classic ES5 script in <head>, before any island imports (not from inside a React effect). Bridge only
 * change listeners, leave native implementations alone, and keep the original live MediaQueryList object.
 */
export function buildMediaQueryCompatScript(): string {
  return `
(function(){
  if (typeof window.matchMedia !== 'function') return;
  var matchMedia = window.matchMedia;
  function compat(query) {
    var media = matchMedia.call(window, query);
    if (typeof media.addEventListener !== 'function' && typeof media.addListener === 'function') {
      media.addEventListener = function(type, listener) {
        if (type === 'change') media.addListener(listener);
      };
    }
    if (typeof media.removeEventListener !== 'function' && typeof media.removeListener === 'function') {
      media.removeEventListener = function(type, listener) {
        if (type === 'change') media.removeListener(listener);
      };
    }
    return media;
  }
  var probe = matchMedia.call(window, 'all');
  if ((typeof probe.addEventListener !== 'function' && typeof probe.addListener === 'function') ||
      (typeof probe.removeEventListener !== 'function' && typeof probe.removeListener === 'function')) {
    window.matchMedia = compat;
  }
})();`;
}
