// ─── Sistema de ingresos recurrentes — Split Sin Drama ──────────────────
// Modelo de suscripción: plan Free (con límite mensual de escaneos IA) y
// plan Pro (mensual o anual) con escaneos ilimitados y beneficios premium.
// La activación/renovación la maneja el webhook de Mercado Pago (ver
// api/mp-webhook.js), que escribe en la tabla `subscriptions` de Supabase.

// Escaneos IA gratis por mes en el plan Free. El contador se reinicia cada
// mes calendario (ver startOfMonthISO).
export const FREE_MONTHLY_SCANS = 3;

// Planes recurrentes. Precios en CLP.
export const PLANS = {
  monthly: {
    id: "monthly",
    label: "Mensual",
    price: 2990,
    periodShort: "/mes",
    tagline: "Flexibilidad total, cancela cuando quieras",
  },
  annual: {
    id: "annual",
    label: "Anual",
    price: 24900,
    periodShort: "/año",
    monthlyEquivalent: 2075, // 24900 / 12
    badge: "2 meses gratis",
    tagline: "El mejor precio — pagas 10 meses, usas 12",
  },
};

// Beneficios del plan Pro (lo que desbloquea la suscripción).
export const PRO_BENEFITS = [
  "Escaneos con IA ilimitados",
  "Salas compartidas ilimitadas",
  "Sin marca de agua en los resúmenes",
  "Soporte prioritario",
];

// Links de suscripción de Mercado Pago (preapproval). Configúralos como
// variables de entorno en Vercel: VITE_MP_PLAN_MONTHLY / VITE_MP_PLAN_ANNUAL.
// Mientras no estén configurados, se usa un cobro único de respaldo con el
// link de pago existente para no bloquear el flujo.
const MP_FALLBACK_LINK = "https://link.mercadopago.cl/donc3lla";
const MP_LINKS = {
  monthly: import.meta.env.VITE_MP_PLAN_MONTHLY || "",
  annual: import.meta.env.VITE_MP_PLAN_ANNUAL || "",
};

// URL de checkout para un plan. Adjunta external_reference = user.id para que
// el webhook pueda asociar el pago con el usuario.
export function checkoutUrl(planId, userId) {
  const ref = encodeURIComponent(userId);
  const link = MP_LINKS[planId];
  if (link) {
    const sep = link.includes("?") ? "&" : "?";
    return `${link}${sep}external_reference=${ref}`;
  }
  // Respaldo: cobro único con el monto del plan.
  const price = PLANS[planId]?.price || PLANS.monthly.price;
  return `${MP_FALLBACK_LINK}?amount=${price}&external_reference=${ref}`;
}

// ¿La suscripción está activa? Considera plan, estado y vigencia del periodo.
export function isProActive(sub) {
  if (!sub || sub.plan !== "pro") return false;
  if (sub.status && sub.status !== "active") return false;
  if (sub.current_period_end) {
    return new Date(sub.current_period_end).getTime() > Date.now();
  }
  return true;
}

// ISO del primer instante del mes actual (para contar escaneos del mes).
export function startOfMonthISO(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// Fecha de renovación legible (ej. "21 de agosto de 2026").
export function formatRenewal(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-CL", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch {
    return "";
  }
}
