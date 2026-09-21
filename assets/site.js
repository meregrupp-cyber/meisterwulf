/* Meisterwulf — keelevalik ja väiksed abimehed. Laetakse <head>-is,
   et keel oleks paigas enne esimest joonistamist. */
(function () {
  var LANGS = ["et", "en", "zh"];
  var doc = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("mw-lang"); } catch (e) {}
  var fromUrl = null;
  try { fromUrl = new URLSearchParams(location.search).get("lang"); } catch (e) {}

  function valid(l) { return LANGS.indexOf(l) > -1 ? l : null; }

  function apply(l, opts) {
    opts = opts || {};
    l = valid(l) || "en";
    doc.setAttribute("data-lang", l);
    doc.lang = l === "zh" ? "zh-Hans" : l;
    var t = doc.getAttribute("data-title-" + l);
    if (t) document.title = t;
    if (opts.persist !== false) {
      try { localStorage.setItem("mw-lang", l); } catch (e) {}
    }
    var btns = document.querySelectorAll(".langbar [data-set-lang]");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-set-lang") === l;
      btns[i].classList.toggle("is-active", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (opts.url && history.replaceState) {
      try {
        var u = new URL(location.href);
        u.searchParams.set("lang", l);
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (e) {}
    }
  }

  var isHome = doc.getAttribute("data-page") === "home";
  var initial = valid(fromUrl) || valid(stored) || "en";

  /* Esileht algab alati neutraalsest olekust (inglise keel, kõik sildid
     100%). Alalehed avanevad viimati valitud keeles. */
  if (!isHome) apply(initial, { persist: !!fromUrl });

  window.MW = {
    LANGS: LANGS,
    apply: apply,
    current: function () { return doc.getAttribute("data-lang") || "en"; },
    stored: function () { return valid(stored); }
  };

  document.addEventListener("DOMContentLoaded", function () {
    /* keelenupud alalehel */
    var btns = document.querySelectorAll(".langbar [data-set-lang]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        apply(this.getAttribute("data-set-lang"), { url: true });
      });
    }
    if (!isHome) apply(doc.getAttribute("data-lang"), { persist: false });

    /* e-posti aadressid pannakse kokku alles siin, et robotid neid
       lehe lähtekoodist ei korjaks */
    var mails = document.querySelectorAll("a[data-u][data-d]");
    for (var j = 0; j < mails.length; j++) {
      var a = mails[j];
      var addr = a.getAttribute("data-u") + "@" + a.getAttribute("data-d");
      var subj = a.getAttribute("data-subject");
      a.href = "mailto:" + addr + (subj ? "?subject=" + encodeURIComponent(subj) : "");
      if (!a.getAttribute("data-keep-text")) a.textContent = addr;
    }

    /* sisemised lingid kannavad keele kaasa */
    var lang = doc.getAttribute("data-lang");
    var links = document.querySelectorAll("a[data-keep-lang]");
    for (var k = 0; k < links.length; k++) {
      var href = links[k].getAttribute("href");
      if (href && href.indexOf("lang=") === -1) {
        links[k].setAttribute("href", href + (href.indexOf("?") > -1 ? "&" : "?") + "lang=" + lang);
      }
    }
  });
})();
