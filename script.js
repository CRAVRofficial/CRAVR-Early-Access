// CRAVR Warteliste: Formular-Anbindung an den Cloudflare-Worker (unverändert
// aus dem Vorgängerprojekt, siehe bridge/worker.js) und dezente Eingangs-
// Animation beim Scrollen. Kein Tracking, keine externen Skripte.

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

  // Reveal-on-scroll: motiviert durch die Reihenfolge Haltung-vor-Produkt,
  // jeder Abschnitt tritt einzeln in Erscheinung statt alles auf einmal zu zeigen.
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealTargets = document.querySelectorAll(".reveal");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach(function (el) {
      el.classList.add("is-visible");
    });
  } else {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealTargets.forEach(function (el) {
      observer.observe(el);
    });
  }
})();
