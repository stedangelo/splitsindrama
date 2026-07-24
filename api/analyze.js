export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "Missing base64 or mimeType" });

  const apiKey = process.env.GEMINI_API_KEY2;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const prompt = `Analiza esta boleta/pre-cuenta de restaurante o bar chileno. Devuelve ÚNICAMENTE un objeto JSON válido sin texto adicional, sin markdown, sin backticks.

Formato exacto:
{"items":[{"name":"nombre","qty":1,"price":5990}],"propina":10,"descuento":0,"descMode":"total"}

Reglas: incluye solo productos consumibles (platos, bebidas, postres). Excluye propina, subtotales, totales. price = precio total de la línea en número entero. qty = cantidad. propina y descuento en porcentaje (0 si no hay).`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini error:", JSON.stringify(data));
    return res.status(response.status).json({ error: data.error?.message || "Error al procesar" });
  }

  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("Gemini respuesta:", text.slice(0, 300));

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) text = jsonMatch[1];
  else text = text.trim();

  res.status(200).json({ content: [{ text }] });
}
