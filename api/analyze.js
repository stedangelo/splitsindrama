export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "Missing base64 or mimeType" });

  const apiKey = process.env.huggingface;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const prompt = `Analiza esta boleta/pre-cuenta de restaurante o bar chileno. Devuelve ÚNICAMENTE un objeto JSON válido sin texto adicional, sin markdown, sin backticks.

Formato exacto:
{"items":[{"name":"nombre","qty":1,"price":5990}],"propina":10,"descuento":0,"descMode":"total"}

Reglas: incluye solo productos consumibles (platos, bebidas, postres). Excluye propina, subtotales, totales. price = precio total de la línea en número entero. qty = cantidad. propina y descuento en porcentaje (0 si no hay).`;

  const response = await fetch(
    "https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-11B-Vision-Instruct/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/Llama-3.2-11B-Vision-Instruct",
        max_tokens: 1200,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }
          ]
        }]
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    console.error("HuggingFace error:", JSON.stringify(data));
    return res.status(response.status).json({ error: data.error?.message || data.error || "Error al procesar" });
  }

  let text = data.choices?.[0]?.message?.content || "";
  console.log("HuggingFace respuesta:", text.slice(0, 300));

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) text = jsonMatch[1];
  else text = text.trim();

  res.status(200).json({ content: [{ text }] });
}
