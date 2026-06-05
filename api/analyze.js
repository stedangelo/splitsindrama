export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "Missing base64 or mimeType" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: `Analiza esta boleta/pre-cuenta de restaurante o bar chileno. Devuelve ÚNICAMENTE un objeto JSON válido sin texto adicional, sin markdown, sin backticks.

Formato exacto:
{"items":[{"name":"nombre","qty":1,"price":5990}],"propina":10,"descuento":0,"descMode":"total"}

Reglas para items:
- Incluye solo productos consumibles: platos, bebidas, postres, agregados.
- EXCLUYE: líneas de propina, descuentos, subtotales, totales, líneas en $0 (cortesías o items sin precio).
- price = precio TOTAL de la línea (cantidad × precio unitario), número entero sin puntos ni comas.
- qty = cantidad indicada en la boleta. Si dice "x2" o "2x" en el nombre, extrae la cantidad al campo qty y limpia el nombre.
- Si el mismo producto aparece en múltiples líneas, inclúyelas como items SEPARADOS — no las agrupes.
- Nombres: limpia prefijos como "JM:" o "Agr." pero mantén el nombre descriptivo.

Reglas para propina/descuento:
- propina: porcentaje numérico (ej. 10 para 10%). 0 si no hay.
- descuento: porcentaje numérico. 0 si no hay.
- descMode: "subtotal" si la propina se calcula sobre el monto original antes del descuento; "total" si el descuento aplica sobre el total con propina o no hay descuento.` }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Gemini error" });

  // Adaptar respuesta al formato que espera el frontend
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  res.status(200).json({ content: [{ text }] });
}
