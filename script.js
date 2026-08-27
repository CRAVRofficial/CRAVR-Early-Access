// CRAVR Warteliste: Formular-Anbindung an den Cloudflare-Worker (unverändert
// aus dem Vorgängerprojekt, siehe bridge/worker.js), Reveal-on-Scroll, die
// Bundle-Ausschnittwechsel und die Flug-Animation von Logo und Button in den
// festen Kopfbereich. Kein Tracking, keine externen Skripte.

(function () {
  "use strict";

  var form = document.getElementById("waitlist-form");
  var messageEl = document.getElementById("form-message");

  if (form) {
    form.addEventListener("submit", handleSubmit);
  }

  function handleSubmit(event) {
    event.preventDefault();
    setMessage("", null);

    var emailInput = document.getElementById("email");
    var honeypot = document.getElementById("website");
    var priceSignal = form.querySelector('input[name="PRICE_SIGNAL"]:checked');
    var submitButton = form.querySelector('button[type="submit"]');

    if (!emailInput.value.trim() || !emailInput.checkValidity()) {
      setMessage("Bitte eine gültige E-Mail-Adresse eintragen.", "error");
      emailInput.focus();
      return;
    }

    var endpoint = form.dataset.endpoint;
    if (!endpoint) {
      setMessage("Anmeldung ist technisch noch nicht verbunden.", "error");
      return;
    }

    submitButton.disabled = true;
    setMessage("Wird gesendet...", null);

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        PRICE_SIGNAL: priceSignal ? priceSignal.value : null,
        website: honeypot ? honeypot.value : ""
      })
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          form.reset();
          setMessage(
            "Fast geschafft. Bitte prüfe dein Postfach und bestätige die Anmeldung über den Link in der E-Mail.",
            "ok"
          );
        } else {
          setMessage("Das hat nicht geklappt. Bitte in ein paar Minuten erneut versuchen.", "error");
        }
      })
      .catch(function () {
        setMessage("Verbindung fehlgeschlagen. Bitte später erneut versuchen.", "error");
      })
      .finally(function () {
        submitButton.disabled = false;
      });
  }

  function setMessage(text, state) {
    if (!messageEl) return;
    messageEl.textContent = text;
    if (state) {
      messageEl.setAttribute("data-state", state);
    } else {
      messageEl.removeAttribute("data-state");
    }
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasIO = "IntersectionObserver" in window;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp01(t) {
    return Math.min(Math.max(t, 0), 1);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Reveal-on-scroll: motiviert durch die Reihenfolge Haltung-vor-Produkt,
  // jeder Abschnitt tritt einzeln in Erscheinung statt alles auf einmal zu zeigen.
  var revealTargets = document.querySelectorAll(".reveal");

  if (reduceMotion || !hasIO) {
    revealTargets.forEach(function (el) {
      el.classList.add("is-visible");
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealTargets.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  // ==========================================================================
  // Bundle-Abschnitt: gepinnter Ausschnittwechsel. Ausloeser ist nicht "50 %
  // eines Ankers sichtbar" (das machte die erste Karte laenger stehen als die
  // uebrigen, weil vor ihr noch die Sticky-Flaeche selbst durchlaufen werden
  // muss), sondern eine duenne Linie in der Bildschirmmitte: sobald die
  // Oberkante eines Ankers dort ankommt, wird seine Karte aktiv. Dadurch ist
  // jeder Abschnitt exakt gleich lang.
  // ==========================================================================

  var bundle = document.querySelector("[data-bundle]");

  if (bundle && hasIO) {
    var slides = bundle.querySelectorAll("[data-slide]");
    var dots = bundle.querySelectorAll("[data-dot]");
    var anchors = bundle.querySelectorAll("[data-anchor]");

    var setActiveSlide = function (index) {
      slides.forEach(function (slide) {
        slide.classList.toggle("is-active", slide.dataset.slide === String(index));
      });
      dots.forEach(function (dot) {
        dot.classList.toggle("is-active", dot.dataset.dot === String(index));
      });
    };

    var bundleObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            setActiveSlide(entry.target.dataset.anchor);
          }
        });
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 }
    );
    anchors.forEach(function (anchor) {
      bundleObserver.observe(anchor);
    });
  }

  // ==========================================================================
  // Flug-Animation: Logo und Button wandern in den festen Kopfbereich.
  //
  // Logo: startet sofort beim Laden (Eingangsanimation, zeitgesteuert) im
  // kleinen Logo-Streifen oben und dockt an, sobald man aus diesem Streifen
  // herausscrollt. Es bleibt vom ersten Pixel an ein fixiertes, per Skript
  // aktualisiertes Element, aber nur fuer die kurze Strecke des Logo-
  // Streifens - danach wird es eingefroren und nicht mehr neu berechnet.
  //
  // Button: bleibt WAEHREND DER GESAMTEN VERWEILDAUER ein ganz normales,
  // unbewegtes Element im Textfluss (sein Anker bleibt sichtbar, das
  // fixierte Flug-Element bleibt unsichtbar und inaktiv). Ein fixiertes
  // Element, das bei jedem Scroll-Ereignis per Skript neu positioniert wird,
  // zittert auf iOS Safari sichtbar waehrend des Scrollens (der native
  // Scroll-Kompositor und die Skript-Aktualisierung laufen dort leicht
  // versetzt). Der Button wechselt darum erst UNMITTELBAR VOR dem
  // eigentlichen Flug auf das fixierte Element, bleibt also die meiste Zeit
  // ein normales Element ohne jedes Zitter-Risiko, und wird nach dem
  // Andocken ebenfalls eingefroren.
  //
  // Beide Bewegungen folgen demselben Muster: solange der jeweilige
  // Flugabschnitt noch nicht begonnen hat, wird die Position eins zu eins
  // aus der normalen Seiten-Scrollbewegung abgeleitet (kein Sprung). Sobald
  // der Abschnitt beginnt, wird der zu diesem Zeitpunkt gueltige Startpunkt
  // eingefroren und nur noch zwischen diesem festen Punkt und dem Zielpunkt
  // interpoliert. Ein Punkt, der gleichzeitig Ziel einer Interpolation UND
  // Ausgangspunkt einer fortlaufenden Berechnung ist, erzeugt sonst eine
  // unbeabsichtigte Kurve statt einer geraden Bewegung.
  //
  // Bei reduzierter Bewegung oder ohne JavaScript bleibt alles beim
  // statischen Ausgangszustand: das grosse Logo oben, der Button im Hero,
  // der Kopfbereich bleibt leer. Kein Informationsverlust, nur ohne die
  // Flug-Inszenierung.
  // ==========================================================================

  var logoAnchor = document.querySelector("[data-logo-anchor]");
  var ctaAnchor = document.querySelector("[data-cta-anchor]");
  var logoFly = document.querySelector("[data-logo-fly]");
  var ctaFly = document.querySelector("[data-cta-fly]");
  var logoSlot = document.querySelector("[data-header-logo-slot]");
  var ctaSlot = document.querySelector("[data-header-cta-slot]");
  var logoZone = document.querySelector("[data-intro-stage]");
  var heroSection = document.querySelector("[data-hero]");

  if (
    !reduceMotion &&
    logoAnchor &&
    ctaAnchor &&
    logoFly &&
    ctaFly &&
    logoSlot &&
    ctaSlot &&
    logoZone &&
    heroSection
  ) {
    document.body.classList.add("js-flying");

    // Bewusst deutlich groesser als jede sichtbare Zielgroesse: ein SVG, das
    // als <img> geladen wird, rastert der Browser einmalig in dieser
    // CSS-Groesse. Nur verkleinern (nie vergroessern) haelt es scharf, siehe
    // ausfuehrliche Begruendung bei .logo-fly in styles.css.
    var LOGO_NATIVE_SIZE = 320;
    var DOCKED_LOGO_SIZE = 40;
    var ENTRANCE_MS = 950;
    var entranceStartTime = performance.now();
    var geometry = {};
    var logoSettled = false;
    var ctaPhase = "anchor"; // "anchor" -> "flying" -> "docked"

    function measure() {
      // Der rechte Slot bekommt die tatsaechliche Groesse des Buttons,
      // sonst insetet ihn "justify-content: space-between" nur um seine
      // eigene (kleine) Breite vom Rand statt um die des Buttons, der dort
      // andocken soll.
      ctaSlot.style.width = ctaFly.offsetWidth + "px";
      ctaSlot.style.height = ctaFly.offsetHeight + "px";

      var scrollY = window.scrollY;
      var logoAnchorRect = logoAnchor.getBoundingClientRect();
      var ctaAnchorRect = ctaAnchor.getBoundingClientRect();
      var logoSlotRect = logoSlot.getBoundingClientRect();
      var ctaSlotRect = ctaSlot.getBoundingClientRect();
      var heroRect = heroSection.getBoundingClientRect();

      var logoAnchorDocY = logoAnchorRect.top + scrollY + logoAnchorRect.height / 2;
      var ctaAnchorDocY = ctaAnchorRect.top + scrollY + ctaAnchorRect.height / 2;
      var heroBottomDocY = heroRect.bottom + scrollY;

      var logoZoneLength = Math.max(logoZone.offsetHeight, 1);
      // Die eigentliche Flugstrecke des Buttons ist bewusst kurz (er soll die
      // ganze Zeit an seinem Platz im Hero verweilen und erst kurz vor dem
      // endgueltigen Verschwinden des Hero losfliegen), unabhaengig davon,
      // wie hoch der Bildschirm gerade ist.
      var CTA_FLIGHT_PX = 320;
      var ctaZoneLength = CTA_FLIGHT_PX;
      var ctaZoneStart = Math.max(heroBottomDocY - CTA_FLIGHT_PX, logoZoneLength);

      geometry = {
        logoZoneLength: logoZoneLength,
        logoStartX: logoAnchorRect.left + logoAnchorRect.width / 2,
        logoFrozenY: logoAnchorDocY, // Zone beginnt bei scrollY 0, daher = natuerlicher Wert bei 0
        logoStartSize: logoAnchorRect.width,
        logoSlotX: logoSlotRect.left + logoSlotRect.width / 2,
        logoSlotY: logoSlotRect.top + logoSlotRect.height / 2,

        ctaAnchorDocY: ctaAnchorDocY,
        ctaZoneStart: ctaZoneStart,
        ctaZoneLength: ctaZoneLength,
        ctaFrozenY: ctaAnchorDocY - ctaZoneStart,
        ctaStartX: ctaAnchorRect.left + ctaAnchorRect.width / 2,
        ctaSlotX: ctaSlotRect.left + ctaSlotRect.width / 2,
        ctaSlotY: ctaSlotRect.top + ctaSlotRect.height / 2,
        ctaHalfW: ctaFly.offsetWidth / 2,
        ctaHalfH: ctaFly.offsetHeight / 2
      };

      // Nach einer Neuvermessung (z. B. Fenstergroesse geaendert) koennte
      // sich die eingefrorene Zielposition verschoben haben, darum beide
      // Elemente einmal neu einrechnen lassen.
      logoSettled = false;
      if (ctaPhase === "docked") {
        ctaPhase = "flying";
      }
    }

    function setCtaPhase(nextPhase) {
      if (nextPhase === ctaPhase) return;
      ctaPhase = nextPhase;
      if (nextPhase === "anchor") {
        ctaAnchor.classList.remove("cta-anchor-hidden");
        ctaFly.classList.remove("cta-fly-visible");
      } else {
        ctaAnchor.classList.add("cta-anchor-hidden");
        ctaFly.classList.add("cta-fly-visible");
      }
    }

    function applyFrame() {
      ticking = false;
      var scrollY = window.scrollY;

      // Logo: Eingangsanimation (zeitgesteuert) mal Andock-Fortschritt (scrollgesteuert).
      // Einmal vollstaendig angekommen, wird nichts mehr neu berechnet.
      var entranceT = clamp01((performance.now() - entranceStartTime) / ENTRANCE_MS);
      var entranceDone = entranceT >= 1;
      var logoProgress = clamp01(scrollY / geometry.logoZoneLength);

      if (!logoSettled) {
        var entranceEase = easeOutCubic(entranceT);
        var logoEase = easeInOutCubic(logoProgress);

        var logoX = lerp(geometry.logoStartX, geometry.logoSlotX, logoEase);
        var logoY = lerp(geometry.logoFrozenY, geometry.logoSlotY, logoEase);
        var logoDockSize = lerp(geometry.logoStartSize, DOCKED_LOGO_SIZE, logoEase);
        var logoScale = (logoDockSize / LOGO_NATIVE_SIZE) * lerp(0.55, 1, entranceEase);

        logoFly.style.opacity = String(entranceEase);
        logoFly.style.transform =
          "translate3d(" + (logoX - LOGO_NATIVE_SIZE / 2) + "px, " + (logoY - LOGO_NATIVE_SIZE / 2) + "px, 0) " +
          "scale(" + logoScale + ")";

        logoSettled = entranceDone && logoProgress >= 1;
      }

      // Button: waehrend der Verweildauer bleibt das eigentliche Anker-Element
      // sichtbar und unbewegt (kein Zittern moeglich), das fixierte Element
      // ist inaktiv. Erst in der kurzen Flugstrecke unmittelbar vor dem
      // Verschwinden des Hero wird umgeschaltet.
      if (scrollY < geometry.ctaZoneStart) {
        setCtaPhase("anchor");
      } else if (scrollY >= geometry.ctaZoneStart + geometry.ctaZoneLength) {
        if (ctaPhase !== "docked") {
          setCtaPhase("flying");
          var ctaX = geometry.ctaSlotX;
          var ctaY = geometry.ctaSlotY;
          ctaFly.style.transform =
            "translate3d(" + (ctaX - geometry.ctaHalfW) + "px, " + (ctaY - geometry.ctaHalfH) + "px, 0) rotate(0deg)";
          ctaPhase = "docked"; // eingefroren, keine weiteren Berechnungen mehr noetig
        }
      } else {
        setCtaPhase("flying");
        var ctaProgress = clamp01((scrollY - geometry.ctaZoneStart) / geometry.ctaZoneLength);
        var ctaEase = easeInOutCubic(ctaProgress);
        var flyY = lerp(geometry.ctaFrozenY, geometry.ctaSlotY, ctaEase);
        var flyX = lerp(geometry.ctaStartX, geometry.ctaSlotX, ctaEase);
        var ctaRotation = Math.sin(ctaEase * Math.PI) * -16;
        ctaFly.style.transform =
          "translate3d(" + (flyX - geometry.ctaHalfW) + "px, " + (flyY - geometry.ctaHalfH) + "px, 0) " +
          "rotate(" + ctaRotation + "deg)";
      }
    }

    var ticking = false;

    function requestFrame() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(applyFrame);
      }
    }

    measure();
    applyFrame();
    window.addEventListener("scroll", requestFrame, { passive: true });

    // Eigenständige Schleife nur fuer die Eingangsanimation, damit das Logo
    // auch dann sichtbar materialisiert, wenn niemand in den ersten Sekunden
    // scrollt.
    function entranceLoop() {
      applyFrame();
      if (performance.now() - entranceStartTime < ENTRANCE_MS) {
        window.requestAnimationFrame(entranceLoop);
      }
    }
    window.requestAnimationFrame(entranceLoop);

    var resizeTimer = null;
    window.addEventListener(
      "resize",
      function () {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          measure();
          requestFrame();
        }, 150);
      },
      { passive: true }
    );

    // Automatischer Weiterscroll aus dem kleinen Logo-Streifen zum Hauptbereich,
    // sobald die Logo-Animation Zeit hatte anzukommen. Bricht sofort ab,
    // sobald der Mensch selbst scrollt, tippt oder eine Taste drueckt, damit
    // die Automatik nie gegen eine echte Eingabe ankaempft.
    var userInteracted = false;
    var cancelEvents = ["wheel", "touchstart", "keydown", "pointerdown"];

    function markInteracted() {
      userInteracted = true;
      cancelEvents.forEach(function (type) {
        window.removeEventListener(type, markInteracted);
      });
    }
    cancelEvents.forEach(function (type) {
      window.addEventListener(type, markInteracted, { passive: true, once: true });
    });

    window.setTimeout(function () {
      if (!userInteracted && window.scrollY < 20) {
        window.scrollTo({ top: geometry.logoZoneLength, behavior: "smooth" });
      }
    }, 1500);
  }
})();
