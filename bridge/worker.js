// Cloudflare Worker: nimmt die Warteliste-Anmeldung von der CRAVR-Seite entgegen
// und startet die doppelte Bestaetigung (Double Opt-in) ueber Brevo. Der Brevo-
// API-Schluessel steht NIE im Website-Code, sondern nur hier als Worker-Secret
// (siehe README.md in diesem Ordner).
//
// Schutzmassnahmen, absichtlich mehrstufig:
//   1. Herkunftspruefung serverseitig (CORS allein schuetzt nur Browser)
//   2. Honeypot-Feld, das echte Menschen nie ausfuellen
//   3. Begrenzung der Anfragen pro IP ueber Cloudflare KV
//   4. Double Opt-in, damit niemand fremde Adressen eintragen kann

const ALLOWED_ORIGINS = [
  "https://cravrofficial.github.io",
  "https://early.cravr.de",
];

const BREVO_LIST_ID = 5; // Liste "CRAVR Early Access" in Brevo

// Hoechstens 5 Anmeldeversuche pro IP innerhalb dieses Zeitfensters
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 300;

const WORKER_VERSION = "2026-08-26-secure6";

function pickOrigin(request) {
  const origin = request.headers.get("Origin");
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function isValidEmail(email) {
  return (
    typeof email === "string" &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

// Nur die vier bekannten Auswahlwerte zulassen, damit ueber das Formular
// kein beliebiger Text in das Brevo-Attribut geschrieben werden kann.
const ALLOWED_PRICE_SIGNALS = ["unter_30", "30_50", "50_70", "ueber_70"];

// Zaehlt die Anfragen pro IP. Ohne KV-Bindung wird nicht blockiert, damit die
// Anmeldung nicht komplett ausfaellt, falls die Bindung fehlt.
async function isRateLimited(env, ip) {
  if (!env.RATE_LIMIT || !ip) return false;

  const key = `rl:${ip}`;
  const current = parseInt((await env.RATE_LIMIT.get(key)) || "0", 10);

  if (current >= RATE_LIMIT_MAX) return true;

  await env.RATE_LIMIT.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
  });
  return false;
}

export default {
  async fetch(request, env) {
    const origin = pickOrigin(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method === "GET") {
      return json(
        200,
        {
          version: WORKER_VERSION,
          has_brevo_key: Boolean(env.BREVO_API_KEY),
          doi_template: env.BREVO_DOI_TEMPLATE_ID || null,
          has_rate_limit: Boolean(env.RATE_LIMIT),
        },
        origin
      );
    }

    if (request.method !== "POST") {
      return json(405, { error: "method_not_allowed" }, origin);
    }

    // Serverseitige Herkunftspruefung. Ein Skript ausserhalb des Browsers
    // ignoriert CORS, deshalb wird hier zusaetzlich geprueft.
    if (!origin) {
      return json(403, { error: "forbidden_origin" }, null);
    }

    const ip = request.headers.get("CF-Connecting-IP");
    if (await isRateLimited(env, ip)) {
      return json(429, { error: "rate_limited" }, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json(400, { error: "invalid_json" }, origin);
    }

    // Honeypot: ein ausgefuelltes Feld bedeutet Bot. Bewusst mit 200 antworten,
    // damit der Bot keine Rueckmeldung ueber die Erkennung bekommt.
    if (typeof payload.website === "string" && payload.website.trim() !== "") {
      return json(200, { ok: true }, origin);
    }

    const email = (payload.email || "").trim();
    if (!isValidEmail(email)) {
      return json(400, { error: "invalid_email" }, origin);
    }

    const priceSignal = ALLOWED_PRICE_SIGNALS.includes(payload.PRICE_SIGNAL)
      ? payload.PRICE_SIGNAL
      : null;

    const attributes = {};
    if (priceSignal) {
      attributes.PRICE_SIGNAL = priceSignal;
    }

    // Bevorzugter Weg: Brevo verschickt eine Bestaetigungsmail und traegt den
    // Kontakt erst nach dem Klick in Liste 5 ein. Das ist der Nachweis der
    // Einwilligung nach Art. 7 DSGVO und verhindert Eintraege fremder Adressen.
    if (env.BREVO_DOI_TEMPLATE_ID && env.BREVO_DOI_REDIRECT_URL) {
      const doiResponse = await fetch(
        "https://api.brevo.com/v3/contacts/doubleOptinConfirmation",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": env.BREVO_API_KEY,
          },
          body: JSON.stringify({
            email,
            attributes,
            includeListIds: [BREVO_LIST_ID],
            templateId: Number(env.BREVO_DOI_TEMPLATE_ID),
            redirectionUrl: env.BREVO_DOI_REDIRECT_URL,
          }),
        }
      );

      if (doiResponse.ok || doiResponse.status === 204) {
        return json(200, { ok: true, doi: true }, origin);
      }

      const doiBody = await doiResponse.json().catch(() => ({}));

      // Bereits bestaetigte Kontakte meldet Brevo als Dublette. Fuer den
      // Nutzer ist das kein Fehler, er steht ja schon auf der Liste.
      if (doiBody?.code === "duplicate_parameter") {
        return json(200, { ok: true, doi: true, already: true }, origin);
      }

      return json(
        502,
        { error: "brevo_doi_failed", brevo_status: doiResponse.status },
        origin
      );
    }

    // Rueckfallweg, solange die Bestaetigungsvorlage in Brevo noch nicht
    // hinterlegt ist. Traegt direkt ein, ohne Bestaetigungsschritt.
    const brevoResponse = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email,
        attributes,
        listIds: [BREVO_LIST_ID],
        updateEnabled: true,
      }),
    });

    if (brevoResponse.ok) {
      return json(200, { ok: true, doi: false }, origin);
    }

    if (brevoResponse.status === 400) {
      const body = await brevoResponse.json().catch(() => ({}));
      if (body?.code === "duplicate_parameter") {
        return json(200, { ok: true, doi: false, already: true }, origin);
      }
    }

    return json(
      502,
      { error: "brevo_request_failed", brevo_status: brevoResponse.status },
      origin
    );
  },
};
