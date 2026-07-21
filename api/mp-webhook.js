// ─── Webhook de suscripciones de Mercado Pago ───────────────────────────
// Recibe las notificaciones de Mercado Pago cuando una suscripción
// (preapproval) se autoriza, se cobra, se pausa o se cancela, y sincroniza
// el estado del plan Pro en la tabla `subscriptions` de Supabase.
//
// Configúralo en Mercado Pago como URL de notificaciones (Webhooks):
//   https://TU-DOMINIO/api/mp-webhook
//
// Variables de entorno requeridas (Vercel):
//   MP_ACCESS_TOKEN            → Access Token de tu cuenta de Mercado Pago
//   SUPABASE_URL               → URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE_KEY  → Service Role Key (solo backend, NUNCA en el front)

import { createClient } from "@supabase/supabase-js";

// Mapea el estado de la suscripción de Mercado Pago al estado interno.
function mapStatus(mpStatus) {
  switch (mpStatus) {
    case "authorized":
      return "active";
    case "paused":
      return "paused";
    case "cancelled":
    case "canceled":
      return "canceled";
    default:
      return "canceled";
  }
}

// Deriva el ciclo de facturación (mensual/anual) desde auto_recurring.
function mapBilling(autoRecurring) {
  if (!autoRecurring) return "monthly";
  const { frequency, frequency_type } = autoRecurring;
  if (frequency_type === "years") return "annual";
  if (frequency_type === "months" && Number(frequency) >= 12) return "annual";
  return "monthly";
}

async function mpFetch(path, token) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`MP ${path} -> ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !supabaseUrl || !serviceKey) {
    console.error("mp-webhook: faltan variables de entorno");
    return res.status(500).json({ error: "Webhook no configurado" });
  }

  try {
    // Mercado Pago envía el tipo y el id tanto por query como por body.
    const type = req.query.type || req.query.topic || req.body?.type || req.body?.topic;
    const id =
      req.query["data.id"] ||
      req.query.id ||
      req.body?.data?.id ||
      req.body?.id;

    if (!id) {
      // Ping de validación de Mercado Pago: responde 200 y termina.
      return res.status(200).json({ ok: true });
    }

    // Resuelve el preapproval (la suscripción) según el tipo de evento.
    let preapproval;
    if (type && type.includes("authorized_payment")) {
      // Cobro recurrente: trae el pago y desde ahí la suscripción.
      const payment = await mpFetch(`/authorized_payments/${id}`, token);
      const preapprovalId = payment.preapproval_id;
      if (!preapprovalId) return res.status(200).json({ ok: true });
      preapproval = await mpFetch(`/preapproval/${preapprovalId}`, token);
    } else {
      // Evento de suscripción (preapproval) directo.
      preapproval = await mpFetch(`/preapproval/${id}`, token);
    }

    const userId = preapproval.external_reference;
    if (!userId) {
      console.warn("mp-webhook: preapproval sin external_reference");
      return res.status(200).json({ ok: true });
    }

    const status = mapStatus(preapproval.status);
    const billing = mapBilling(preapproval.auto_recurring);
    // next_payment_date marca el fin del periodo vigente (fecha de renovación).
    const periodEnd =
      preapproval.next_payment_date ||
      preapproval.auto_recurring?.end_date ||
      null;

    const supabase = createClient(supabaseUrl, serviceKey);
    const { error } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          plan: status === "active" ? "pro" : "free",
          status,
          billing,
          current_period_end: periodEnd,
          mp_preapproval_id: preapproval.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("mp-webhook: error Supabase", error);
      return res.status(500).json({ error: "DB error" });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("mp-webhook: error", e);
    // Responder 200 evita reintentos infinitos por errores no recuperables;
    // usa 500 solo si quieres que Mercado Pago reintente.
    return res.status(200).json({ ok: true });
  }
}
