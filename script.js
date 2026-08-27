// CRAVR Warteliste: Formular-Anbindung an den Cloudflare-Worker (unverändert
// aus dem Vorgängerprojekt, siehe bridge/worker.js), Eingangs-Animation beim
// Scrollen, fester Kopfbereich sobald der Hero verlassen wird, und der
// gepinnte Ausschnittwechsel im Bundle-Abschnitt. Kein Tracking, keine
// externen Skripte.

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

  // Fester Kopfbereich: erscheint, sobald der Hero den oberen Bildschirmrand
  // verlaesst, verschwindet wieder, sobald man zurueck zum Hero scrollt.
  // Motiviert durch Orientierung: das Logo bleibt als Ankerpunkt sichtbar,
  // ohne im Hero selbst zu verdoppeln.
  var header = document.querySelector("[data-site-header]");
  var hero = document.querySelector("[data-hero]");

  if (header && hero && hasIO) {
    var headerObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          header.classList.toggle("is-visible", !entry.isIntersecting);
        });
      },
      { rootMargin: "-" + (header.offsetHeight || 76) + "px 0px 0px 0px" }
    );
    headerObserver.observe(hero);
  }

  // Bundle-Abschnitt: gepinnter Ausschnittwechsel. Je nachdem, welcher der
  // drei unsichtbaren Anker gerade im Sichtfenster steht, wird die passende
  // Textkarte eingeblendet, Vorgaenger und Nachfolger bleiben unsichtbar
  // im gleichen Platz liegen (kein Layout-Sprung).
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
})();
