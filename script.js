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
  // Bundle-Abschnitt: gepinnter Ausschnittwechsel. Ausloeser ist eine duenne
  // Linie an der UNTERKANTE des Bildschirms: sobald die Oberkante eines
  // Ankers dort ankommt, wird seine Karte aktiv.
  //
  // Warum die Unterkante und nicht die Mitte: die gepinnte Flaeche ist selbst
  // 100vh hoch und steht im Fluss VOR den Ankern. Eine Linie in der Mitte
  // wird von jedem Anker daher erst 50vh spaeter erreicht, als er eigentlich
  // dran waere. Die erste Karte stand dadurch 162vh lang, die zweite 112vh,
  // die dritte nur 62vh. An der Unterkante faellt dieser Versatz weg und
  // jede Karte bekommt exakt die Ankerhoehe (.bundle-anchor in styles.css)
  // als Scrollstrecke. Wer die Verweildauer aendern will, aendert nur dort.
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
      { rootMargin: "-100% 0px 0px 0px", threshold: 0 }
    );
    anchors.forEach(function (anchor) {
      bundleObserver.observe(anchor);
    });
  }

  // ==========================================================================
  // Flug-Animation: der Button wandert in den festen Kopfbereich.
  // (Das Logo hat eine eigene, unabhaengige Positionierung in intro.js -
  // es dockt aus der Intro-Choreographie heraus, nicht per Scroll-Strecke
  // ab dem Hero. Der Kopfbereich-Slot dafuer bleibt derselbe.)
  //
  // Der Button bleibt WAEHREND DER GESAMTEN VERWEILDAUER ein ganz normales,
  // unbewegtes Element im Textfluss (sein Anker bleibt sichtbar, das
  // fixierte Flug-Element bleibt unsichtbar und inaktiv). Ein fixiertes
  // Element, das bei jedem Scroll-Ereignis per Skript neu positioniert wird,
  // zittert auf iOS Safari sichtbar waehrend des Scrollens (der native
  // Scroll-Kompositor und die Skript-Aktualisierung laufen dort leicht
  // versetzt). Der Button wechselt darum erst UNMITTELBAR VOR dem
  // eigentlichen Flug auf das fixierte Element, bleibt also die meiste Zeit
  // ein normales Element ohne jedes Zitter-Risiko, und wird nach dem
  // Andocken eingefroren.
  //
  // Solange der Flugabschnitt noch nicht begonnen hat, wird die Position
  // eins zu eins aus der normalen Seiten-Scrollbewegung abgeleitet (kein
  // Sprung). Sobald er beginnt, wird der zu diesem Zeitpunkt gueltige
  // Startpunkt eingefroren und nur noch zwischen diesem festen Punkt und dem
  // Zielpunkt interpoliert.
  //
  // Bei reduzierter Bewegung oder ohne JavaScript bleibt der Button im Hero,
  // der Kopfbereich-Slot dafuer bleibt leer. Kein Informationsverlust, nur
  // ohne die Flug-Inszenierung.
  // ==========================================================================

  var ctaAnchor = document.querySelector("[data-cta-anchor]");
  var ctaFly = document.querySelector("[data-cta-fly]");
  var ctaSlot = document.querySelector("[data-header-cta-slot]");
  var heroSection = document.querySelector("[data-hero]");

  if (!reduceMotion && ctaAnchor && ctaFly && ctaSlot && heroSection) {
    document.body.classList.add("js-flying");

    var geometry = {};
    var ctaPhase = "anchor"; // "anchor" -> "flying" -> "docked"

    function measure() {
      // Der rechte Slot bekommt die tatsaechliche Groesse des Buttons,
      // sonst insetet ihn "justify-content: space-between" nur um seine
      // eigene (kleine) Breite vom Rand statt um die des Buttons, der dort
      // andocken soll.
      ctaSlot.style.width = ctaFly.offsetWidth + "px";
      ctaSlot.style.height = ctaFly.offsetHeight + "px";

      var scrollY = window.scrollY;
      var ctaAnchorRect = ctaAnchor.getBoundingClientRect();
      var ctaSlotRect = ctaSlot.getBoundingClientRect();
      var heroRect = heroSection.getBoundingClientRect();

      var ctaAnchorDocY = ctaAnchorRect.top + scrollY + ctaAnchorRect.height / 2;
      var heroBottomDocY = heroRect.bottom + scrollY;

      // Die eigentliche Flugstrecke des Buttons ist bewusst kurz (er soll die
      // ganze Zeit an seinem Platz im Hero verweilen und erst kurz vor dem
      // endgueltigen Verschwinden des Hero losfliegen), unabhaengig davon,
      // wie hoch der Bildschirm gerade ist.
      var CTA_FLIGHT_PX = 320;
      var ctaZoneLength = CTA_FLIGHT_PX;
      var ctaZoneStart = Math.max(heroBottomDocY - CTA_FLIGHT_PX, 0);

      geometry = {
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
      // sich die eingefrorene Zielposition verschoben haben.
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

      // Waehrend der Verweildauer bleibt das eigentliche Anker-Element
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
  }
})();
