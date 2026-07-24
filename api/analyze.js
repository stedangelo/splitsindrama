export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "Missing base64 or mimeType" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.2-11b-vision-preview",
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Analiza esta boleta/pre-cuenta de restaurante o bar chileno. Puede estar en formato ticket de papel o boleta electrónica tributaria con columnas. Devuelve ÚNICAMENTE un objeto JSON válido sin texto adicional, sin markdown, sin backticks.

Formato exacto:
{"items":[{"name":"nombre","qty":1,"price":5990}],"propina":10,"descuento":0,"descMode":"total"}

Reglas para items:
- Incluye solo productos consumibles: platos, bebidas, postres, agregados.
- EXCLUYE completamente: filas de "Descuento", propina, subtotales, totales, líneas en $0.
- price = precio TOTAL de la línea (cantidad × precio unitario), número entero sin puntos ni comas.
- qty = cantidad indicada en la boleta. Si dice "x2" extrae qty y limpia el nombre.
- Si el mismo producto aparece en múltiples líneas, inclúyelas como items SEPARADOS.
- Nombres: limpia prefijos como "JM:", "Agr.", códigos numéricos al inicio.

Reglas para propina/descuento:
- propina: porcentaje numérico (ej. 10 para 10%). 0 si no hay.
- descuento: porcentaje de descuento global. 0 si no hay.
- descMode: "subtotal" si la propina va sobre el monto antes del descuento; "total" si no hay descuento.`
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` }
          }
        ]
      }]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Groq error:", JSON.stringify(data));
    return res.status(response.status).json({ error: data.error?.message || "Error al procesar" });
  }

  let text = data.choices?.[0]?.message?.content || "";
  console.log("Groq respuesta:", text.slice(0, 300));

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) text = jsonMatch[1];
  else text = text.trim();

  res.status(200).json({ content: [{ text }] });
}
