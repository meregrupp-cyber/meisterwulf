/* Raudvaal — lugemisleht: sisukord, peatükid, sõnastik, kood.
   Sisu tuleb failidest /raudvaal/sisu/*.json (ehitab scripts/build-raudvaal.mjs).
   Tasuta peatükid on failides avatekstina. Tasulised on krüpteeritud (AES-GCM);
   kood tuletatakse brauseris võtmeks (PBKDF2, sama sool ja iteratsioonid mis ehitusel),
   võti jääb localStorage'isse, et koodi ei peaks iga kord uuesti sisestama.
   Teed: #sisukord (vaikimisi), #proloog, #peatukk-01 … #peatukk-24, #sonastik, #kood. */
(function () {
  "use strict";
  var BASE = "/raudvaal/sisu/";
  var toc = null, key = null, cache = {}, pending = null, resume = false, current = null;
  var subtle = window.crypto && window.crypto.subtle;

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    (children || []).forEach(function (c) { n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  /* ---------- vaated ---------- */
  var VIEWS = ["sisukord", "peatukk", "sonastik", "kood", "teade"];
  function show(name) {
    VIEWS.forEach(function (v) { $("#vaade-" + v).hidden = v !== name; });
    if (window.Tolge) window.Tolge.close();
    if (name !== "peatukk") current = null;
  }
  function teade(text) { $("#teade").textContent = text; document.title = "Raudvaal — Meister Wulf"; show("teade"); window.scrollTo(0, 0); }

  /* ---------- krüpto ---------- */
  function b64d(s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function b64e(buf) { var a = new Uint8Array(buf), s = ""; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function deriveKey(kood) {
    return subtle.importKey("raw", new TextEncoder().encode(kood.normalize("NFC")), "PBKDF2", false, ["deriveKey"]).then(function (km) {
      return subtle.deriveKey({ name: "PBKDF2", salt: b64d(toc.kdf.salt), iterations: toc.kdf.iter, hash: "SHA-256" },
                              km, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    });
  }
  function decrypt(k, enc) {
    return subtle.decrypt({ name: "AES-GCM", iv: b64d(enc.iv) }, k, b64d(enc.ct)).then(function (buf) { return new TextDecoder().decode(buf); });
  }
  function checkKey(k) {
    if (!toc.kontroll) return Promise.resolve(null);
    return decrypt(k, toc.kontroll).then(function (t) { return t === "ok" ? k : null; }, function () { return null; });
  }
  function rememberKey(k) { subtle.exportKey("raw", k).then(function (raw) { store("rv-voti", b64e(raw)); }); }
  function restoreKey() {
    var s = load("rv-voti");
    if (!s || !subtle || !toc.kontroll) return Promise.resolve(null);
    return subtle.importKey("raw", b64d(s), { name: "AES-GCM" }, true, ["decrypt"]).then(checkKey, function () { return null; });
  }
  function forgetKey() { key = null; cache = {}; store("rv-voti", null); }

  /* ---------- sisu ---------- */
  function fetchJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function getChapter(slug) {
    if (cache[slug]) return Promise.resolve(cache[slug]);
    return fetchJSON(BASE + slug + ".json").then(function (ch) {
      if (ch.html != null) { cache[slug] = ch; return ch; }
      if (!key) { var e = new Error("lukus"); e.lukus = true; throw e; }
      return decrypt(key, ch.enc).then(function (html) { ch.html = html; delete ch.enc; cache[slug] = ch; return ch; });
    });
  }
  function readable(p) { return p.published || (p.mustand && !!key); }
  function chapters() { return toc.peatukid.filter(readable); }
  function find(slug) { for (var i = 0; i < toc.peatukid.length; i++) if (toc.peatukid[i].slug === slug) return toc.peatukid[i]; return null; }
  function label(p) { return (p.number ? p.number + ". " : "") + p.pealkiri; }

  /* ---------- sisukord ---------- */
  function lockIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "lukk"); svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 0 0-4 0v2z");
    svg.appendChild(path); return svg;
  }
  function tocRow(p) {
    var ok = readable(p);
    var li = el("li", { "class": "pt" + (ok ? "" : " pt--tulekul") });
    li.appendChild(el("span", { "class": "pt-nr" }, [p.number || ""]));
    li.appendChild(ok ? el("a", { "class": "pt-nimi", href: "#" + p.slug }, [p.pealkiri]) : el("span", { "class": "pt-nimi" }, [p.pealkiri]));
    var silt = null;
    if (!ok) silt = el("span", { "class": "pt-silt pt-silt--tulekul" }, ["tulekul"]);
    else if (p.mustand) silt = el("span", { "class": "pt-silt pt-silt--mustand" }, ["mustand"]);
    else if (p.free) silt = el("span", { "class": "pt-silt pt-silt--tasuta" }, ["tasuta"]);
    else if (!key) { silt = el("span", { "class": "pt-silt", title: "Avaneb koodiga" }, ["lukus"]); silt.insertBefore(lockIcon(), silt.firstChild); }
    if (silt) li.appendChild(silt);
    return li;
  }
  function renderTOC() {
    var box = $("#sisukord"); box.textContent = "";
    var groups = [{ ord: 0, pealkiri: null }].concat(toc.osad);
    groups.forEach(function (osa) {
      var items = toc.peatukid.filter(function (p) { return p.osa === osa.ord; });
      if (!items.length) return;
      if (osa.pealkiri) box.appendChild(el("h2", null, [osa.pealkiri]));
      var ol = el("ol", { "class": "peatukid" });
      items.forEach(function (p) { ol.appendChild(tocRow(p)); });
      box.appendChild(ol);
    });
    box.appendChild(el("h2", null, ["Lisad"]));
    var lisad = el("ol", { "class": "peatukid" });
    var li = el("li", { "class": "pt" }); li.appendChild(el("span", { "class": "pt-nr" }, [""]));
    li.appendChild(el("a", { "class": "pt-nimi", href: "#sonastik" }, ["Sõnastik: saksa–eesti"]));
    li.appendChild(el("span", { "class": "pt-silt pt-silt--tasuta" }, ["tasuta"]));
    lisad.appendChild(li); box.appendChild(lisad);

    /* seis päises */
    var pub = toc.peatukid.filter(function (p) { return p.published && p.number; }).length;
    var total = toc.peatukid.filter(function (p) { return p.number; }).length;
    var tasuta = toc.peatukid.filter(function (p) { return p.published && p.free; }).map(function (p) { return p.number ? p.number + " peatükk" : "proloog"; });
    $("#seis").textContent = "Üleval: " + (toc.peatukid[0].published ? "proloog ja " : "") + pub + " peatükki " + total + "-st. Tasuta: " + tasuta.join(" ja ") + ". Ülejäänud peatükid avanevad koodiga.";

    /* jätka lugemist */
    var j = $("#jatka"); j.textContent = "";
    var jarg = load("rv-jarg"), p = jarg && find(jarg.slug);
    if (p && readable(p)) {
      var a = el("a", { "class": "btn", href: "#" + p.slug }, ["Jätka lugemist: " + label(p)]);
      a.addEventListener("click", function () { resume = true; });
      j.appendChild(a);
    }

    /* koodi vihje */
    var v = $("#koodivihje"); v.textContent = "";
    var vp = el("p");
    if (!toc.kontroll) vp.textContent = "Kõik üleval olevad peatükid on tasuta.";
    else if (key) {
      vp.appendChild(document.createTextNode("Kood on sisestatud, kõik valmis peatükid on avatud. "));
      var f = el("a", { href: "#sisukord" }, ["Unusta kood"]);
      f.addEventListener("click", function (e) { e.preventDefault(); forgetKey(); renderTOC(); });
      vp.appendChild(f);
    } else {
      vp.appendChild(document.createTextNode("Lukus peatükid avanevad koodiga: "));
      vp.appendChild(el("a", { href: "#kood" }, ["sisesta kood"]));
      vp.appendChild(document.createTextNode("."));
    }
    v.appendChild(vp);
    document.title = "Raudvaal — Meister Wulf";
  }

  /* ---------- peatükk ---------- */
  function renderChapter(ch) {
    var p = find(ch.slug);
    $("#pt-number").textContent = ch.number || "";
    $("#pt-number").hidden = !ch.number;
    $("#pt-pealkiri").textContent = ch.title;
    $("#pt-dateline").textContent = ch.dateline || "";
    $("#pt-dateline").hidden = !ch.dateline;
    $("#pt-mustand").hidden = ch.published !== false;
    var fig = $("#pt-pilt"), img = $("#pt-pilt-img");
    if (ch.illustration) { img.src = ch.illustration; img.alt = "Illustratsioon: " + ch.title; fig.hidden = false; }
    else { img.removeAttribute("src"); fig.hidden = true; }
    $("#pt-tekst").innerHTML = ch.html;                       /* ehitusskripti toodetud HTML */
    var list = chapters(), i = list.indexOf(p);
    var prev = i > 0 ? list[i - 1] : null, next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
    var a = $("#nav-eelmine"), b = $("#nav-jargmine");
    a.hidden = !prev; if (prev) { a.href = "#" + prev.slug; a.textContent = "← " + label(prev); }
    b.hidden = !next; if (next) { b.href = "#" + next.slug; b.textContent = label(next) + " →"; }
    if (ch.slug === "proloog") {
      var foot = el("p", { "class": "leht-viide" });
      foot.appendChild(document.createTextNode("Terve lugu: "));
      foot.appendChild(el("a", { href: "/books.html?lang=et#meister-wulf" }, ["„Meister Wulf“, esimene raamat"]));
      $("#pt-tekst").appendChild(foot);
    }
    document.title = label(p) + " — Raudvaal";
  }

  /* lugemisjärg: viimane peatükk + kerimisasukoht */
  var saveTimer = null;
  function savePos() {
    if (!current) return;
    store("rv-jarg", { slug: current, y: Math.round(window.scrollY) });
  }
  window.addEventListener("scroll", function () {
    if (!current) return;
    clearTimeout(saveTimer); saveTimer = setTimeout(savePos, 400);
  }, { passive: true });
  window.addEventListener("pagehide", savePos);

  function openChapter(slug) {
    var p = find(slug);
    if (!p) { teade("Sellist peatükki ei ole."); return; }
    if (!readable(p)) { teade(label(p) + " on tulekul."); return; }
    getChapter(slug).then(function (ch) {
      renderChapter(ch);
      show("peatukk");
      var jarg = load("rv-jarg");
      if (resume && jarg && jarg.slug === slug) window.scrollTo(0, jarg.y || 0); else window.scrollTo(0, 0);
      resume = false;
      current = slug;
      savePos();
    }, function (e) {
      if (e && e.lukus) { pending = slug; showKood(label(p)); }
      else teade("Peatükki ei õnnestunud laadida (" + (e && e.message ? e.message : "viga") + ").");
    });
  }

  /* ---------- kood ---------- */
  function showKood(what) {
    $("#kood-selgitus").textContent = (what ? what + " on lukus. " : "") + "Koodiga avanevad kõik valmis peatükid; kood jääb sellesse brauserisse meelde.";
    $("#kood-teade").textContent = subtle ? "" : "See brauser ei toeta krüpteeritud sisu avamist (vaja on HTTPS-i ja WebCrypto tuge).";
    show("kood"); window.scrollTo(0, 0);
    document.title = "Kood — Raudvaal";
    setTimeout(function () { $("#kood").focus(); }, 50);
  }
  $("#kood-vorm").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("#kood"), msg = $("#kood-teade"), btn = $("#kood-nupp");
    var kood = input.value.trim();
    if (!kood || !subtle) return;
    btn.disabled = true; msg.className = "kood-teade"; msg.textContent = "Kontrollin…";
    deriveKey(kood).then(checkKey).then(function (k) {
      btn.disabled = false;
      if (!k) { msg.textContent = "Kood ei sobi."; input.select(); return; }
      key = k; rememberKey(k); input.value = "";
      msg.className = "kood-teade on-ok"; msg.textContent = "Kood sobib.";
      var to = pending || "sisukord"; pending = null;
      if (location.hash === "#" + to) route(); else location.hash = to;
    }, function () { btn.disabled = false; msg.textContent = "Koodi ei õnnestunud kontrollida."; });
  });

  /* ---------- sõnastik ---------- */
  function showGlossary() {
    fetchJSON(BASE + "sonastik.json").then(function (items) {
      var dl = $("#sonastik"); dl.textContent = "";
      if (!items.length) dl.appendChild(el("dt", null, ["Sõnastik on veel tühi."]));
      items.forEach(function (it) {
        dl.appendChild(el("dt", { lang: "de" }, [it.saksa]));
        var dd = el("dd", null, [it.tolge]);
        if (it.peatukid && it.peatukid.length) dd.appendChild(el("small", null, ["ptk " + it.peatukid.join(", ")]));
        dl.appendChild(dd);
      });
      document.title = "Sõnastik — Raudvaal";
      show("sonastik"); window.scrollTo(0, 0);
    }, function () { teade("Sõnastikku ei õnnestunud laadida."); });
  }

  /* ---------- teed ---------- */
  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, "")) || "sisukord";
    if (h === "sisukord") { renderTOC(); show("sisukord"); if (!resume) window.scrollTo(0, 0); return; }
    if (h === "sonastik") { showGlossary(); return; }
    if (h === "kood") { showKood(""); return; }
    openChapter(h);
  }
  window.addEventListener("hashchange", route);

  $("#year").textContent = new Date().getFullYear();
  fetchJSON(BASE + "sisukord.json").then(function (t) {
    toc = t;
    return restoreKey().then(function (k) { key = k; route(); });
  }, function () { teade("Sisukorda ei õnnestunud laadida."); });
})();
