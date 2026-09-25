/* Mullid Meister Wulfi raamatute lugemislehel: tõlge, seletus, pilt, heli.
   Elemendid tekstis (ehitab scripts/build-raudvaal.mjs):
     <span class="saksa" data-liik="tolge" data-tolge="…">Jawohl.</span>
     <span class="lisa lisa--pilt" data-liik="pilt" data-pealkiri="…" data-tolge="…" data-pilt="/assets/…jpg"
           data-pildi-allkiri="…" data-pildi-allikas="…" data-litsents="…" data-pildi-leht="…" data-allikad='[{"tekst","url"}]'>Kiel</span>
     <span class="lisa lisa--heli" data-liik="heli" data-heli="/assets/…mp3" data-heli-allkiri="…" data-helitugevus="0.25">ALARRRM!</span>
     <span class="lisa lisa--markus" …><span class="sr-only">Lisa: Käsilood</span></span>   (autori infomulli viide, ainult ikoon)
   Klõps/puudutus avab mulli elemendi kohal (või all); sama elemendi uus puudutus, klõps mujal,
   Esc või mulli × sulgeb. Klaviatuur: Tab, Enter/tühik. Korraga üks mull. Heli mängib mulli
   avamisel (vaikselt), peatub sulgemisel; mullis on nupp „Peata / Mängi”. */
(function () {
  "use strict";
  var SEL = ".saksa, .lisa";
  var open = null, bubble = null, audio = null, audioBtn = null;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function ensure() {
    if (bubble) return bubble;
    bubble = el("div", "tolge-mull");
    bubble.id = "tolge-mull";
    bubble.setAttribute("role", "dialog");
    bubble.hidden = true;
    document.body.appendChild(bubble);
    return bubble;
  }

  /* ---------- heli ---------- */
  function audioStop() {
    if (audio && !audio.paused) { audio.pause(); audio.currentTime = 0; }
    if (audioBtn) { audioBtn.textContent = "▶ Mängi"; audioBtn.setAttribute("aria-pressed", "false"); }
    if (open) open.classList.remove("is-playing");
  }
  function audioPlay(src, vol) {
    if (!audio) { audio = new Audio(); audio.preload = "auto"; audio.addEventListener("ended", audioStop); }
    if (audio.getAttribute("src") !== src) audio.src = src;
    audio.volume = vol;
    if (audioBtn) { audioBtn.textContent = "■ Peata"; audioBtn.setAttribute("aria-pressed", "true"); }
    if (open) open.classList.add("is-playing");
    var p = audio.play();
    if (p && p.catch) p.catch(function () { audioStop(); });
  }

  /* ---------- sisu ---------- */
  function build(elm) {
    var b = ensure(); b.textContent = ""; audioBtn = null;
    var liik = elm.getAttribute("data-liik") || "tolge";
    b.className = "tolge-mull tolge-mull--" + liik;
    var close = el("button", "tolge-mull-sulge", "×");
    close.type = "button"; close.setAttribute("aria-label", "Sulge");
    close.addEventListener("click", hide);
    b.appendChild(close);
    var title = elm.getAttribute("data-pealkiri");
    if (title) b.appendChild(el("h4", "tolge-mull-pealkiri", title));
    var text = elm.getAttribute("data-tolge") || "";
    text.split(/\n\s*\n/).forEach(function (par) { if (par.trim()) b.appendChild(el("p", "tolge-mull-tekst", par.trim())); });
    var pilt = elm.getAttribute("data-pilt");
    if (pilt) {
      var fig = el("figure", "tolge-mull-pilt");
      var img = el("img"); img.src = pilt; img.alt = elm.getAttribute("data-pildi-allkiri") || title || ""; img.loading = "eager"; img.decoding = "async";
      fig.appendChild(img);
      var cap = el("figcaption");
      var allkiri = elm.getAttribute("data-pildi-allkiri");
      if (allkiri) cap.appendChild(el("span", "tolge-mull-allkiri", allkiri));
      var allikas = elm.getAttribute("data-pildi-allikas");
      if (allikas) {
        var small = el("small", "tolge-mull-allikas");
        var leht = elm.getAttribute("data-pildi-leht"), lits = elm.getAttribute("data-litsents");
        if (leht) { var a1 = el("a", null, allikas); a1.href = leht; a1.target = "_blank"; a1.rel = "noopener"; small.appendChild(a1); }
        else small.appendChild(document.createTextNode(allikas));
        if (lits) { small.appendChild(document.createTextNode(" · ")); var a2 = el("a", null, "litsents"); a2.href = lits; a2.target = "_blank"; a2.rel = "noopener"; small.appendChild(a2); }
        small.appendChild(document.createTextNode(" · vähendatud"));
        cap.appendChild(small);
      }
      if (cap.childNodes.length) fig.appendChild(cap);
      b.appendChild(fig);
    }
    var heli = elm.getAttribute("data-heli");
    if (heli) {
      var row = el("div", "tolge-mull-heli");
      audioBtn = el("button", "tolge-mull-nupp", "▶ Mängi"); audioBtn.type = "button"; audioBtn.setAttribute("aria-pressed", "false");
      var vol = parseFloat(elm.getAttribute("data-helitugevus")) || 0.35;
      audioBtn.addEventListener("click", function () { if (audio && !audio.paused) audioStop(); else audioPlay(heli, vol); });
      row.appendChild(audioBtn);
      var hcap = elm.getAttribute("data-heli-allkiri");
      if (hcap) row.appendChild(el("span", "tolge-mull-heliallkiri", hcap));
      b.appendChild(row);
      audioPlay(heli, vol);
    }
    var allikad = elm.getAttribute("data-allikad");
    if (allikad) {
      try {
        var list = JSON.parse(allikad);
        if (list.length) {
          var p = el("p", "tolge-mull-allikad", "Allikad: ");
          list.forEach(function (s, i) {
            if (i) p.appendChild(document.createTextNode(" · "));
            var a = el("a", null, s.tekst || s.url); a.href = s.url; a.target = "_blank"; a.rel = "noopener"; p.appendChild(a);
          });
          b.appendChild(p);
        }
      } catch (e) {}
    }
  }

  /* ---------- asukoht ---------- */
  function place(elm) {
    var b = bubble;
    var rects = elm.getClientRects();
    var r = rects.length ? rects[0] : elm.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var pad = 12;
    b.style.left = "0px"; b.style.top = "0px";
    b.style.maxWidth = Math.min(b.classList.contains("tolge-mull--tolge") ? 340 : 420, vw - 2 * pad) + "px";
    b.style.maxHeight = Math.round(vh * 0.72) + "px";
    var bw = b.offsetWidth, bh = b.offsetHeight;
    var cx = r.left + r.width / 2;
    var left = Math.round(Math.min(Math.max(pad, cx - bw / 2), Math.max(pad, vw - pad - bw)));
    var above = r.top - bh - 12 >= 4;
    var below = r.bottom + bh + 12 <= vh;
    var top = above ? r.top - bh - 10 : below ? r.bottom + 10 : Math.max(4, Math.min(r.top - bh - 10, vh - bh - 4));
    b.style.left = Math.round(left + window.scrollX) + "px";
    b.style.top = Math.round(top + window.scrollY) + "px";
    b.style.setProperty("--nool", Math.round(cx - left) + "px");
    b.classList.toggle("is-all", !above);
  }

  function show(elm) {
    hide();
    open = elm;                         /* enne build(): heli käivitub kohe ja märgib elemendi */
    build(elm);
    bubble.hidden = false;
    place(elm);
    var img = bubble.querySelector("img");
    if (img && !img.complete) img.addEventListener("load", function () { if (open === elm) place(elm); }, { once: true });
    elm.setAttribute("aria-expanded", "true");
    elm.setAttribute("aria-describedby", bubble.id);
    open = elm;
  }
  function hide() {
    audioStop();
    if (!open) return;
    open.setAttribute("aria-expanded", "false");
    open.removeAttribute("aria-describedby");
    open = null;
    if (bubble) bubble.hidden = true;
  }
  function toggle(elm) { if (open === elm) hide(); else show(elm); }

  document.addEventListener("click", function (e) {
    var elm = e.target.closest ? e.target.closest(SEL) : null;
    if (elm) { e.preventDefault(); toggle(elm); return; }
    if (bubble && bubble.contains(e.target)) return;
    hide();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { hide(); return; }
    var t = e.target;
    if ((e.key === "Enter" || e.key === " ") && t && t.matches && t.matches(SEL)) { e.preventDefault(); toggle(t); }
  });
  window.addEventListener("resize", function () { if (open) place(open); });

  window.Tolge = { close: hide };
})();
