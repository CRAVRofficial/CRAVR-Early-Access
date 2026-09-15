/*
  Intro-Choreographie: dunkler Vollbild-Screen, auf dem sich Sanduhr, Lorbeerkranz
  und Schriftzug gestaffelt aufbauen/zeichnen, danach dockt das fertige Logo in
  die Kopfzeile (dorthin, wo auch das kleine Logo im Header sitzt). Die Seite
  scrollt danach ganz normal, Kopfzeile und "Platz sichern" bleiben ueberall
  erreichbar.

  Zurueck zum dunklen Screen kommt man je nach Geraet unterschiedlich: am
  Desktop, wer an scrollY 0 mit Maus/Trackpad weiter nach oben scrollt
  (Ueberziehen, wo eigentlich nichts mehr kommt), zieht die Animation wie
  einen Vorhang zurueck. Auf Touch-Geraeten uebernimmt das native "Pull to
  Refresh" des Browsers dieselbe Rolle (am oberen Rand nach unten ziehen
  laedt die Seite neu), siehe attachPullHandling weiter unten.

  Aktivierung (No-JS, prefers-reduced-motion) laeuft ueber die "intro-run"-
  Klasse auf <html>, siehe Inline-Script im <head> von index.html. Ohne diese
  Klasse bleibt das SVG ein normales, bereits fertig gezeichnetes Element am
  Seitenanfang (siehe Basis-Regeln in styles.css), dieses Skript tut dann nichts.
*/

(function () {
  "use strict";

  var html = document.documentElement;
  if (!html.classList.contains("intro-run")) {
    return;
  }

  var backdrop = document.getElementById("intro-backdrop");
  var mark = document.getElementById("intro-mark");
  var headerSlot = document.querySelector("[data-header-logo-slot]");
  if (!backdrop || !mark || !headerSlot) {
    html.classList.add("intro-scrollable");
    return;
  }

  function clamp01(t) {
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ---- Zeichnen/Aufbauen: Reihenfolge und Timing, in ms innerhalb von REVEAL_MS. ----
  var PIECE_DURATION = 550;
  var DRAW_DURATION = 750;
  var timelineSteps = [
    { selector: "#glas", delay: 0, stagger: 0 },
    {
      selector:
        "#fundament-unten .piece, #saeulenfundamente .piece, #saeulen-elemente .piece, #fundament-oben .piece",
      delay: 150,
      stagger: 22,
    },
    { selector: "#fallender-sand .piece", delay: 500, stagger: 16 },
    { selector: "#sandhaufen-unten, #sandhaufen-oben, #spiegelung", delay: 650, stagger: 60 },
    { selector: "#mark-lorbeerkranz .draw", delay: 1150, stagger: 90 },
    // Lese-Reihenfolge C-R-A-V-R, nicht die Dokumentenreihenfolge der Pfade.
    {
      selector: ["#letter-c", "#letter-r1", "#letter-a", "#letter-v", "#letter-r2"],
      delay: 1650,
      stagger: 100,
    },
  ];

  var items = [];
  var revealEndMs = 0;

  timelineSteps.forEach(function (step) {
    var els =
      typeof step.selector === "string"
        ? mark.querySelectorAll(step.selector)
        : step.selector.map(function (sel) {
            return mark.querySelector(sel);
          });

    els.forEach(function (el, i) {
      if (!el) return;
      var isDraw = el.classList.contains("draw");
      var durationMs = isDraw ? DRAW_DURATION : PIECE_DURATION;
      var startMs = step.delay + i * step.stagger;
      var len = null;
      if (isDraw && typeof el.getTotalLength === "function") {
        len = el.getTotalLength();
        el.style.strokeDasharray = len;
        // Sichtbarkeit haengt bei Draw-Elementen allein am Dashoffset, das
        // CSS-Standard-opacity:0 (siehe styles.css) ist nur die Grundstellung
        // vor dem Priming und muss hier aufgehoben werden.
        el.style.opacity = 1;
      }
      items.push({ el: el, isDraw: isDraw, startMs: startMs, durationMs: durationMs, len: len });
      revealEndMs = Math.max(revealEndMs, startMs + durationMs);
    });
  });

  var REVEAL_MS = revealEndMs;
  var HOLD_MS = 400;
  var DOCK_MS = 700;
  var TOTAL_MS = REVEAL_MS + HOLD_MS + DOCK_MS;
  var REVEAL_FRACTION = REVEAL_MS / TOTAL_MS;
  var DOCK_START_FRACTION = (REVEAL_MS + HOLD_MS) / TOTAL_MS;

  var geometry = {};

  function measure() {
    // mark.offsetWidth waere hier nicht verlaesslich: <svg>-Wurzelelemente
    // unterstuetzen offsetWidth/offsetHeight nicht durchgehend (das ist eine
    // HTMLElement-Eigenschaft, kein SVGElement-Standard). getBoundingClientRect
    // wiederum wuerde die bereits ANGEWENDETE transform-Skalierung mitmessen,
    // sobald einmal gedockt wurde. Der berechnete CSS-Wert von "width" bleibt
    // in beiden Faellen die verlaessliche, unverzerrte Basisgroesse.
    var slotRect = headerSlot.getBoundingClientRect();
    geometry = {
      naturalSize: parseFloat(getComputedStyle(mark).width),
      centerX: window.innerWidth / 2,
      centerY: window.innerHeight / 2,
      slotCenterX: slotRect.left + slotRect.width / 2,
      slotCenterY: slotRect.top + slotRect.height / 2,
      slotSize: slotRect.width || 40,
    };
  }

  // Zentrale Render-Funktion: bildet EINEN Fortschrittswert (0 = dunkler
  // Screen, nichts gezeichnet; 1 = fertig gezeichnet und klein in der
  // Kopfzeile angedockt) auf den kompletten sichtbaren Zustand ab. Wird
  // sowohl vom Auto-Ablauf beim Laden als auch vom Scroll-Handler benutzt,
  // das macht die Rueckwaerts-Bewegung zu einem echten Zurueckspulen statt
  // einer zweiten, separaten Animation.
  function render(progress) {
    var revealT = clamp01(progress / REVEAL_FRACTION);
    var elapsed = revealT * REVEAL_MS;

    items.forEach(function (item) {
      var localT = clamp01((elapsed - item.startMs) / item.durationMs);
      if (item.isDraw) {
        item.el.style.strokeDashoffset = lerp(item.len, 0, easeInOutCubic(localT));
      } else {
        var e = easeOutCubic(localT);
        item.el.style.opacity = e;
        item.el.style.transform = "scale(" + lerp(0.82, 1, e) + ")";
      }
    });

    var dockT = clamp01((progress - DOCK_START_FRACTION) / (1 - DOCK_START_FRACTION));
    var dockEase = easeInOutCubic(dockT);

    var half = geometry.naturalSize / 2;
    var scale = lerp(1, geometry.slotSize / geometry.naturalSize, dockEase);
    var x = lerp(geometry.centerX, geometry.slotCenterX, dockEase);
    var y = lerp(geometry.centerY, geometry.slotCenterY, dockEase);
    mark.style.transform =
      "translate3d(" + (x - half) + "px," + (y - half) + "px,0) scale(" + scale + ")";

    backdrop.style.opacity = String(1 - dockEase);
    backdrop.style.pointerEvents = progress >= 0.999 ? "none" : "auto";
  }

  measure();
  render(0);

  // ---- Phase 1: automatischer Ablauf beim Laden, Scroll bleibt gesperrt
  // (siehe html.intro-run body { overflow: hidden } in styles.css). Die
  // Notbremse (safety) kann fruehe greifen als die eigentliche rAF-Schleife,
  // wenn der Tab im Hintergrund gedrosselt wird (requestAnimationFrame
  // ticked dort kaum/gar nicht, waehrend setTimeout trotzdem naeherungsweise
  // an der realen Zeit bleibt). "autoplayActive" sorgt dafuer, dass eine
  // spaeter doch noch nachtickende Schleife den bereits fertigen Zustand
  // nicht wieder ueberschreibt. ----
  var autoplayStart = null;
  var autoplayActive = true;
  var safety = setTimeout(finishAutoplay, TOTAL_MS + 2500);

  function autoplayFrame(ts) {
    if (!autoplayActive) return;
    if (autoplayStart === null) autoplayStart = ts;
    var progress = clamp01((ts - autoplayStart) / TOTAL_MS);
    render(progress);
    if (progress < 1) {
      requestAnimationFrame(autoplayFrame);
    } else {
      finishAutoplay();
    }
  }
  requestAnimationFrame(autoplayFrame);

  var scrollingEnabled = false;

  function finishAutoplay() {
    autoplayActive = false;
    if (scrollingEnabled) return;
    scrollingEnabled = true;
    clearTimeout(safety);
    measure();
    render(1);
    html.classList.add("intro-scrollable");
    attachPullHandling();
  }

  // ---- Phase 2: Zieh-Geste am oberen Rand. Die Seite scrollt ab hier ganz
  // normal (Kopfzeile mit Logo und "Platz sichern" bleiben durchgehend
  // erreichbar, an jeder Scroll-Position). Nur wer an scrollY 0 weiter nach
  // oben zieht/scrollt (Ueberziehen, wo eigentlich nichts mehr kommt), holt
  // die Animation zurueck - wie einen Vorhang, den man aufzieht. Laesst man
  // los, bevor er halb offen ist, faellt er wieder zu, sonst zieht er ganz auf.
  // ----
  function attachPullHandling() {
    var PULL_SPAN = 380; // Zieh-Strecke in "Pixel-Aequivalent" bis voll offen
    var pull = 0; // 0 = normaler, angedockter Zustand; 1 = ganz aufgezogen (dunkler Screen)
    var settleTimer = null;
    var settleAnim = null;

    function setPull(next) {
      pull = clamp01(next);
      render(1 - pull);
    }

    function cancelSettle() {
      clearTimeout(settleTimer);
      clearTimeout(settleAnim);
      settleAnim = null;
    }

    // Nach einer kurzen Pause (Geste beendet) auf die naehere Seite einrasten,
    // statt in einer halb offenen Zwischenposition haengen zu bleiben. Per
    // setTimeout statt requestAnimationFrame gestuft (16ms je Schritt): rAF
    // wird in Hintergrund-/inaktiven Tabs gedrosselt oder ganz ausgesetzt,
    // dann bliebe der Vorhang auf halbem Weg haengen.
    function scheduleSettle() {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 140);
    }

    function settle() {
      var target = pull >= 0.5 ? 1 : 0;
      var start = pull;
      var startTime = Date.now();
      var DURATION = 260;
      function step() {
        var t = clamp01((Date.now() - startTime) / DURATION);
        setPull(lerp(start, target, easeOutCubic(t)));
        settleAnim = t < 1 ? setTimeout(step, 16) : null;
      }
      step();
    }

    function onWheel(e) {
      if (window.scrollY > 0) {
        if (pull > 0) setPull(0); // Seite wurde anderswo gescrollt, Geste verwerfen
        return;
      }
      if (e.deltaY < 0 || pull > 0) {
        e.preventDefault();
        cancelSettle();
        setPull(pull + -e.deltaY / PULL_SPAN);
        scheduleSettle();
      }
    }

    // Auf Touch-Geraeten bewusst KEINE eigene Zieh-Simulation: das native
    // "Pull to Refresh" des mobilen Browsers uebernimmt diese Rolle direkt
    // (am oberen Rand nach unten ziehen laedt die Seite neu, der Auto-Ablauf
    // beim Laden zeigt dann wieder den dunklen Screen von vorn). Kein
    // touchmove/preventDefault noetig, das wuerde dem nativen Verhalten nur
    // im Weg stehen.
    window.addEventListener("wheel", onWheel, { passive: false });

    var resizeTimer = null;
    window.addEventListener(
      "resize",
      function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(measure, 150);
      },
      { passive: true }
    );
  }
})();
