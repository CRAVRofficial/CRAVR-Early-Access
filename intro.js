/*
  Intro-Choreographie: dunkler Vollbild-Screen, auf dem sich Sanduhr, Lorbeerkranz
  und Schriftzug gestaffelt aufbauen, danach Uebergang in die eigentliche Seite.
  Aktivierung/Deaktivierung (No-JS, prefers-reduced-motion) laeuft ueber die
  "intro-run"-Klasse auf <html>, siehe Inline-Script im <head> von index.html.

  Laeuft unabhaengig von der Flug-Animation in script.js (Logo/Button docken in
  den Kopfbereich): dieses Overlay liegt nur optisch obendrauf (hoher z-index),
  script.js misst und berechnet seine Positionen unveraendert im Hintergrund.
*/

(function () {
  var html = document.documentElement;

  function cleanup() {
    html.classList.remove("intro-run");
    var el = document.getElementById("intro");
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  // Notbremse: egal was unten passiert, die Seite darf nie laenger als ein
  // paar Sekunden hinter dem Overlay haengen bleiben (z.B. bei einem Fehler
  // in der restlichen Choreographie).
  var safety = setTimeout(cleanup, 6500);

  if (!html.classList.contains("intro-run")) {
    return;
  }

  var intro = document.getElementById("intro");
  var mark = intro ? intro.querySelector(".intro-mark") : null;
  if (!intro || !mark) {
    cleanup();
    return;
  }

  var PIECE_DURATION = 550;
  var DRAW_DURATION = 750;

  // Reihenfolge/Timing der Choreographie. Jede Zeile: CSS-Selektor(en),
  // Start-Verzoegerung der ersten Figur, Abstand zwischen den Figuren.
  var timeline = [
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

  var latestEnd = 0;

  timeline.forEach(function (step) {
    var els =
      typeof step.selector === "string"
        ? mark.querySelectorAll(step.selector)
        : step.selector.map(function (sel) {
            return mark.querySelector(sel);
          });

    els.forEach(function (el, i) {
      if (!el) return;
      var isDraw = el.classList.contains("draw");
      var duration = isDraw ? DRAW_DURATION : PIECE_DURATION;
      var elDelay = step.delay + i * step.stagger;

      if (isDraw && typeof el.getTotalLength === "function") {
        var length = el.getTotalLength();
        el.style.strokeDasharray = length;
        el.style.strokeDashoffset = length;
      }

      el.style.animationDelay = elDelay + "ms";
      latestEnd = Math.max(latestEnd, elDelay + duration);
    });
  });

  // Erst jetzt (naechster Frame) die Animationen scharf schalten, damit der
  // "ungezeichnete" Ausgangszustand sicher schon gesetzt ist.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      mark.classList.add("is-active");
    });
  });

  setTimeout(function () {
    mark.classList.add("intro-glow-pulse");
  }, latestEnd + 150);

  setTimeout(function () {
    intro.classList.add("is-exiting");
  }, latestEnd + 150 + 700 + 150);

  intro.addEventListener(
    "animationend",
    function (event) {
      if (event.target === intro) {
        clearTimeout(safety);
        cleanup();
      }
    },
    { once: true }
  );
})();
