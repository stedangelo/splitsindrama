const MODELS = [
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];

const prompt = `Analiza esta boleta/pre-cuenta de restaurante o bar chileno. Devuelve ÚNICAMENTE un objeto JSON válido sin texto adicional, sin markdown, sin backticks.

Formato exacto:
{"items":[{"name":"nombre","qty":1,"price":5990}],"propina":10,"descuento":0,"descMode":"total"}

Reglas: incluye solo productos consumibles (platos, bebidas, postres). Excluye propina, subtotales, totales. price = precio total de la línea en número entero. qty = cantidad. propina y descuento en porcentaje (0 si no hay).`;

async function callModel(apiKey, model, base64, mimeType) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://splitsindrama.vercel.app",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }
        ]
      }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Error del modelo");
  return data.choices?.[0]?.message?.content || "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "Missing base64 or mimeType" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  let lastError = "";
  for (const model of MODELS) {
    try {
      console.log(`Intentando modelo: ${model}`);
      let text = await callModel(apiKey, model, base64, mimeType);
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) text = jsonMatch[1];
      else text = text.trim();
      console.log(`Respuesta de ${model}:`, text.slice(0, 200));
      return res.status(200).json({ content: [{ text }] });
    } catch (e) {
      console.error(`Falló ${model}:`, e.message);
      lastError = e.message;
    }
  }

  res.status(500).json({ error: lastError || "Error al procesar la boleta" });
}
