/* Meisterwulf — keelevalik ja väiksed abimehed. Laetakse <head>-is,
   et keel oleks paigas enne esimest joonistamist. */
(function () {
  var LANGS = ["et", "en", "zh"];
  var doc = document.documentElement;
  var fromUrl = null;
  try { fromUrl = new URLSearchParams(location.search).get("lang"); } catch (e) {}

  function valid(l) { return LANGS.indexOf(l) > -1 ? l : null; }
  /* selektoris tehtud valik; loetakse iga kord uuesti, sest teine leht
     (või tagasi-nupuga taastatud leht) võib olla vahepeal keelt vahetanud */
  function stored() {
    var s = null;
    try { s = localStorage.getItem("mw-lang"); } catch (e) {}
    return valid(s);
  }

  /* Sisemised lingid (data-keep-lang) kannavad alati parajasti valitud
     keele kaasa — ka siis, kui keelt vahetati alles sellel lehel. Nii
     ei muutu keel lehte vahetades enne, kui selektoris tehakse uus valik. */
  function keepLang(l) {
    var links = document.querySelectorAll("a[data-keep-lang]");
    for (var k = 0; k < links.length; k++) {
      var href = links[k].getAttribute("href") || "";
      var hash = "", i = href.indexOf("#");
      if (i > -1) { hash = href.slice(i); href = href.slice(0, i); }
      var q = href.indexOf("?");
      var path = q > -1 ? href.slice(0, q) : href;
      var parts = q > -1 ? href.slice(q + 1).split("&") : [];
      parts = parts.filter(function (p) { return p && p.indexOf("lang=") !== 0; });
      parts.push("lang=" + l);
      links[k].setAttribute("href", path + "?" + parts.join("&") + hash);
    }
  }

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
    keepLang(l);
    try { document.dispatchEvent(new CustomEvent("mw:lang", { detail: l })); } catch (e) {}
  }

  var isHome = doc.getAttribute("data-page") === "home";

  /* Selektoris valitud keel on ülimuslik: see ei muutu lehte vahetades
     (ka mitte vana ajalookirje või kõrvalise lingi ?lang= järgi), kuni
     selektoris tehakse uus valik. URL-i ?lang= kehtib, kui valikut pole
     veel tehtud (esmakülastus, jagatud link). */
  var chosen = stored();
  var initial = chosen || valid(fromUrl) || "en";

  /* Esileht algab alati neutraalsest olekust (inglise keel, kõik sildid
     100%). Alalehed avanevad valitud keeles. */
  if (!isHome) apply(initial, { persist: !chosen && !!valid(fromUrl), url: !!fromUrl && fromUrl !== initial });

  window.MW = {
    LANGS: LANGS,
    apply: apply,
    current: function () { return doc.getAttribute("data-lang") || "en"; },
    stored: stored,
    keepLang: keepLang
  };

  /* tagasi-nupuga taastatud leht (bfcache) võtab vahepeal mujal valitud keele */
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted || isHome) return;
    var l = stored();
    if (l && l !== doc.getAttribute("data-lang")) apply(l, { persist: false, url: !!fromUrl });
  });

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

    /* sisemised lingid kannavad keele kaasa (uuendatakse igal keelevahetusel) */
    keepLang(doc.getAttribute("data-lang") || "en");
  });
})();
