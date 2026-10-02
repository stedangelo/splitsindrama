const MODELS = [
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];

const PROMPT = `Lee la imagen de esta boleta o pre-cuenta de restaurante/bar chileno. Responde solo con JSON válido, sin texto ni markdown, con esta estructura exacta:
{"items":[{"name":"nombre del producto","qty":1,"price":5990}],"propina":10,"descuento":0,"descMode":"total"}

Reglas:
- Transcribe cada producto consumible con su precio TOTAL de línea en pesos chilenos, como número entero sin puntos ni símbolos.
- qty es la cantidad indicada; si no aparece, usa 1. No multipliques price otra vez por qty.
- Incluye platos, bebidas, postres y agregados. Excluye subtotales, total, IVA, propina, descuentos y líneas de $0.
- Si el nombre ocupa más de una línea, únela. No inventes ni completes texto ilegible.
- propina y descuento son porcentajes numéricos; usa 0 si no aparecen.
- descMode es "subtotal" si la propina se calcula antes del descuento; en otro caso usa "total".
- Si la imagen no es una boleta o no se distinguen productos y precios, devuelve {"items":[],"propina":0,"descuento":0,"descMode":"total"}.`;

export function parseModelResponse(raw) {
  const text = String(raw ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("La respuesta del modelo no contiene JSON.");

  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("El modelo devolvió un JSON inválido.");
  }
  if (!Array.isArray(parsed.items)) throw new Error("La respuesta no incluye una lista de productos.");

  const items = parsed.items.filter(item =>
    item && typeof item.name === "string" && item.name.trim() &&
    Number.isFinite(Number(item.price)) && Number(item.price) > 0
  ).map(item => ({
    name: item.name.trim(),
    qty: Number.isFinite(Number(item.qty)) && Number(item.qty) > 0 ? Number(item.qty) : 1,
    price: Math.round(Number(item.price)),
  }));

  if (!items.length) throw new Error("No se reconocieron productos con precio.");
  return {
    items,
    propina: Number.isFinite(Number(parsed.propina)) ? Number(parsed.propina) : 0,
    descuento: Number.isFinite(Number(parsed.descuento)) ? Number(parsed.descuento) : 0,
    descMode: parsed.descMode === "subtotal" ? "subtotal" : "total",
  };
}

async function callModel(apiKey, model, base64, mimeType) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://splitsindrama.vercel.app",
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: [{ role: "user", content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
      ] }],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Error HTTP ${response.status}`);
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("El modelo devolvió una respuesta vacía.");
  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { base64, mimeType } = req.body || {};
  if (!base64 || !mimeType) return res.status(400).json({ error: "Falta la imagen para analizar." });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Falta configurar OPENROUTER_API_KEY en Vercel." });

  const failures = [];
  for (const model of MODELS) {
    try {
      console.log(`Intentando modelo de visión: ${model}`);
      const result = parseModelResponse(await callModel(apiKey, model, base64, mimeType));
      console.log(`Modelo ${model} reconoció ${result.items.length} productos.`);
      return res.status(200).json({ content: [{ text: JSON.stringify(result) }], model });
    } catch (error) {
      const message = error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "Tiempo agotado"
        : String(error?.message || "Error desconocido").slice(0, 240);
      console.error(`Falló modelo ${model}: ${message}`);
      failures.push(`${model}: ${message}`);
    }
  }

  return res.status(502).json({
    error: "Ningún modelo pudo leer la boleta. Intenta con una foto más nítida o vuelve a intentar.",
    details: failures,
  });
}
