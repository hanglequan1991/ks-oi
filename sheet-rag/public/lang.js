/*
 * Browser language memory. Plain script, no dependencies, no DOM changes
 * beyond one click listener. Stores the visitor's language choice in
 * localStorage under "hd_lang" ("vi" or "en") and redirects on load to the
 * saved language's URL. Any storage error is ignored.
 */
(function () {
  var KEY = "hd_lang";

  function readSaved() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function writeChoice(lang) {
    try {
      window.localStorage.setItem(KEY, lang);
    } catch (e) {
      // Storage blocked: the link still navigates normally.
    }
  }

  function isEnglishPath(pathname) {
    return pathname === "/en" || pathname.indexOf("/en/") === 0;
  }

  function redirectTarget(saved, pathname, search, hash) {
    var english = isEnglishPath(pathname);
    if (saved === "en" && !english) {
      return "/en" + pathname + search + hash;
    }
    if (saved === "vi" && english) {
      var stripped = pathname === "/en" || pathname === "/en/" ? "/" : pathname.slice(3);
      return stripped + search + hash;
    }
    return null;
  }

  try {
    var loc = window.location;
    var target = redirectTarget(readSaved(), loc.pathname, loc.search, loc.hash);
    if (target !== null) {
      loc.replace(target);
    }
  } catch (e) {
    // Never throw from the language script.
  }

  document.addEventListener("click", function (event) {
    try {
      var node = event.target;
      var link = node && node.closest ? node.closest("a[data-lang]") : null;
      if (!link) return;
      var lang = link.dataset ? link.dataset.lang : link.getAttribute("data-lang");
      if (lang === "vi" || lang === "en") {
        writeChoice(lang);
      }
    } catch (e) {
      // Never block navigation.
    }
  });
})();
