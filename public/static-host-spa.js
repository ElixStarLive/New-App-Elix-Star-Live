/**
 * Static-host SPA path handoff.
 * Contract: keep one path segment, encode `&` as `~and~`, use `?/` on entry.
 */
(function attachElixStaticHostSpa(global) {
  var AMP_STANDIN = "~and~";
  var KEPT_SEGMENTS = 1;

  function encodeAmpersands(value) {
    return String(value).split("&").join(AMP_STANDIN);
  }

  function decodeAmpersands(value) {
    return String(value).split(AMP_STANDIN).join("&");
  }

  function originPrefix(loc) {
    return loc.protocol + "//" + loc.hostname + (loc.port ? ":" + loc.port : "");
  }

  function bounceMissingFileToAppEntry(loc) {
    var here = loc || global.location;
    var pieces = here.pathname.split("/");
    var basePath = pieces.slice(0, 1 + KEPT_SEGMENTS).join("/");
    var remainder = pieces.slice(1 + KEPT_SEGMENTS).join("/");
    var queryTail = here.search ? "&" + encodeAmpersands(here.search.slice(1)) : "";
    here.replace(
      originPrefix(here) +
        basePath +
        "/?/" +
        encodeAmpersands(remainder) +
        queryTail +
        here.hash
    );
  }

  function restoreAppEntryFromQuery(loc) {
    var here = loc || global.location;
    if (here.search.charAt(1) !== "/") return;
    var restored = here.search
      .slice(1)
      .split("&")
      .map(function (piece) {
        return decodeAmpersands(piece);
      })
      .join("?");
    global.history.replaceState(null, "", here.pathname.slice(0, -1) + restored + here.hash);
  }

  global.ElixStaticHostSpa = {
    bounceMissingFileToAppEntry: bounceMissingFileToAppEntry,
    restoreAppEntryFromQuery: restoreAppEntryFromQuery,
  };
})(window);
