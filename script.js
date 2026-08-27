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

  // Bundle-Abschnitt: gepinnter Ausschnittwechsel. Je nachdem, welcher der
  // drei unsichtbaren Anker gerade im Sichtfenster steht, wird die passende
  // Textkarte eingeblendet. Die Anker sind bewusst 155vh hoch, damit
  // zwischen zwei Wechseln eine ruhige Pause liegt statt eines direkten
  // Anschlusses.
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
      { threshold: 0.5 }
    );
    anchors.forEach(function (anchor) {
      bundleObserver.observe(anchor);
    });
  }

  // ==========================================================================
  // Flug-Animation: Logo und Button wandern von ihrer großen Ausgangsposition
  // (Intro beziehungsweise Hero) in den festen Kopfbereich. Bewusst ohne
  // Animationsbibliothek: ein scroll-Listener setzt nur ein Merkmal, die
  // eigentliche Berechnung läuft gebündelt einmal pro Bildwechsel (requestAnimationFrame),
  // damit nichts bei jedem einzelnen Scroll-Ereignis blockiert.
  //
  // Bei reduzierter Bewegung oder ohne JavaScript bleibt alles beim
  // statischen Ausgangszustand: das große Logo im Intro, der Button im
  // Hero, der Kopfbereich bleibt leer. Kein Informationsverlust, nur ohne
  // die Flug-Inszenierung.
  // ==========================================================================

  var logoAnchor = document.querySelector("[data-logo-anchor]");
  var ctaAnchor = document.querySelector("[data-cta-anchor]");
  var logoFly = document.querySelector("[data-logo-fly]");
  var ctaFly = document.querySelector("[data-cta-fly]");
  var logoSlot = document.querySelector("[data-header-logo-slot]");
  var ctaSlot = document.querySelector("[data-header-cta-slot]");
  var introStage = document.querySelector("[data-intro-stage]");

  if (
    !reduceMotion &&
    logoAnchor &&
    ctaAnchor &&
    logoFly &&
    ctaFly &&
    logoSlot &&
    ctaSlot &&
    introStage
  ) {
    document.body.classList.add("js-flying");

    var DOCKED_LOGO_SIZE = 40;
    var geometry = {};

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function measure() {
      // Der rechte Slot bekommt die tatsaechliche Groesse des Buttons,
      // sonst insetet ihn "justify-content: space-between" nur um seine
      // eigene (kleine) Breite vom Rand statt um die des Buttons, der dort
      // andocken soll.
      ctaSlot.style.width = ctaFly.offsetWidth + "px";
      ctaSlot.style.height = ctaFly.offsetHeight + "px";

      var logoAnchorRect = logoAnchor.getBoundingClientRect();
      var ctaAnchorRect = ctaAnchor.getBoundingClientRect();
      var logoSlotRect = logoSlot.getBoundingClientRect();
      var ctaSlotRect = ctaSlot.getBoundingClientRect();
      var scrollY = window.scrollY;

      geometry = {
        logoStartX: logoAnchorRect.left + logoAnchorRect.width / 2,
        logoStartY: logoAnchorRect.top + scrollY + logoAnchorRect.height / 2,
        logoStartSize: logoAnchorRect.width,
        logoSlotX: logoSlotRect.left + logoSlotRect.width / 2,
        logoSlotY: logoSlotRect.top + logoSlotRect.height / 2,

        ctaStartX: ctaAnchorRect.left + ctaAnchorRect.width / 2,
        ctaStartY: ctaAnchorRect.top + scrollY + ctaAnchorRect.height / 2,
        ctaSlotX: ctaSlotRect.left + ctaSlotRect.width / 2,
        ctaSlotY: ctaSlotRect.top + ctaSlotRect.height / 2,
        ctaHalfW: ctaFly.offsetWidth / 2,
        ctaHalfH: ctaFly.offsetHeight / 2,

        transitionZone: introStage.offsetHeight
      };
    }

    var ticking = false;

    function applyFrame() {
      ticking = false;
      var scrollY = window.scrollY;
      var progress = Math.min(Math.max(scrollY / geometry.transitionZone, 0), 1);
      var eased = progress; // linear folgt dem Finger/Scrollrad am direktesten

      var logoY = lerp(geometry.logoStartY - scrollY, geometry.logoSlotY, eased);
      var logoX = lerp(geometry.logoStartX, geometry.logoSlotX, eased);
      var logoSize = lerp(geometry.logoStartSize, DOCKED_LOGO_SIZE, eased);
      var logoScale = logoSize / DOCKED_LOGO_SIZE;
      logoFly.style.transform =
        "translate3d(" + (logoX - DOCKED_LOGO_SIZE / 2) + "px, " + (logoY - DOCKED_LOGO_SIZE / 2) + "px, 0) scale(" + logoScale + ")";

      var ctaY = lerp(geometry.ctaStartY - scrollY, geometry.ctaSlotY, eased);
      var ctaX = lerp(geometry.ctaStartX, geometry.ctaSlotX, eased);
      var ctaRotation = lerp(-380, 0, eased);
      ctaFly.style.transform =
        "translate3d(" + (ctaX - geometry.ctaHalfW) + "px, " + (ctaY - geometry.ctaHalfH) + "px, 0) rotate(" + ctaRotation + "deg)";
    }

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

    // Automatischer Weiterscroll vom Intro zum Hauptbereich, sobald die
    // Logo-Animation Zeit hatte anzukommen. Bricht sofort ab, sobald der
    // Mensch selbst scrollt, tippt oder eine Taste drückt, damit die
    // Automatik nie gegen eine echte Eingabe ankämpft.
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
      if (!userInteracted && window.scrollY < 40) {
        window.scrollTo({ top: geometry.transitionZone, behavior: "smooth" });
      }
    }, 1650);
  }
})();
