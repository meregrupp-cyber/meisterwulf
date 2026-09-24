/* Saksa väljendite tõlkemullid (Meister Wulfi raamatud).
   Element tekstis:
     <span class="saksa" tabindex="0" role="button" aria-expanded="false" data-tolge="…">Jawohl.</span>
   Klõps/puudutus avab mulli väljendi kohal (või all, kui üleval ruumi pole); sama
   elemendi uus puudutus, klõps mujal või Esc sulgeb. Klaviatuur: Tab, Enter/tühik.
   Korraga on lahti üks mull; mull ei nihuta teksti ega lähe ekraani servast välja. */
(function () {
  "use strict";
  var open = null, bubble = null;

  function ensure() {
    if (bubble) return bubble;
    bubble = document.createElement("div");
    bubble.className = "tolge-mull";
    bubble.id = "tolge-mull";
    bubble.setAttribute("role", "tooltip");
    bubble.hidden = true;
    document.body.appendChild(bubble);
    return bubble;
  }

  function place(el) {
    var b = bubble;
    var rects = el.getClientRects();
    var r = rects.length ? rects[0] : el.getBoundingClientRect();    /* mitmerealisel väljendil esimene rida */
    var vw = document.documentElement.clientWidth;
    var pad = 12;
    b.style.left = "0px"; b.style.top = "0px";
    b.style.maxWidth = Math.min(340, vw - 2 * pad) + "px";
    var bw = b.offsetWidth, bh = b.offsetHeight;
    var cx = r.left + r.width / 2;
    var left = Math.round(Math.min(Math.max(pad, cx - bw / 2), Math.max(pad, vw - pad - bw)));
    var above = r.top - bh - 12 >= 4;
    var top = above ? r.top - bh - 10 : r.bottom + 10;
    b.style.left = Math.round(left + window.scrollX) + "px";
    b.style.top = Math.round(top + window.scrollY) + "px";
    b.style.setProperty("--nool", Math.round(cx - left) + "px");
    b.classList.toggle("is-all", !above);
  }

  function show(el) {
    hide();
    var b = ensure();
    b.textContent = el.getAttribute("data-tolge") || "";
    b.hidden = false;
    place(el);
    el.setAttribute("aria-expanded", "true");
    el.setAttribute("aria-describedby", b.id);
    open = el;
  }

  function hide() {
    if (!open) return;
    open.setAttribute("aria-expanded", "false");
    open.removeAttribute("aria-describedby");
    open = null;
    if (bubble) bubble.hidden = true;
  }

  function toggle(el) { if (open === el) hide(); else show(el); }

  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest(".saksa") : null;
    if (el) { e.preventDefault(); toggle(el); return; }
    if (bubble && bubble.contains(e.target)) return;
    hide();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { hide(); return; }
    var t = e.target;
    if ((e.key === "Enter" || e.key === " ") && t && t.classList && t.classList.contains("saksa")) {
      e.preventDefault(); toggle(t);
    }
  });
  window.addEventListener("resize", function () { if (open) place(open); });

  window.Tolge = { close: hide };
})();
