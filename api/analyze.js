export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "Missing base64 or mimeType" });

  const apiKey = process.env.GEMINI_API_KEY2 || process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const prompt = `Analiza esta boleta/pre-cuenta de restaurante o bar chileno. Puede estar en formato ticket de papel o boleta electrónica tributaria con columnas. Devuelve ÚNICAMENTE un objeto JSON válido sin texto adicional, sin markdown, sin backticks.

Formato exacto:
{"items":[{"name":"nombre","qty":1,"price":5990}],"propina":10,"descuento":0,"descMode":"total"}

Reglas para items:
- Incluye solo productos consumibles: platos, bebidas, postres, agregados.
- EXCLUYE completamente: filas de "Descuento", propina, subtotales, totales, líneas en $0, ingredientes sueltos (mantequilla, tomate, etc.), items de restaurante/proveedor.
- price = precio TOTAL de la línea (cantidad × precio unitario), número entero sin puntos ni comas.
- qty = cantidad indicada en la boleta (número a la izquierda del nombre). Si dice "x2" o "2x" en el nombre, extrae la cantidad al campo qty y limpia el nombre.
- En boletas electrónicas con formato de tabla: el nombre puede ocupar 2 líneas, la cantidad está a la izquierda y el precio a la derecha. Si hay una fila "Descuento %10" inmediatamente después de un ítem, ignórala (el descuento se captura globalmente).
- Si el mismo producto aparece en múltiples líneas, inclúyelas como items SEPARADOS.
- Nombres: limpia prefijos como "JM:", "Agr.", códigos numéricos al inicio. Conserva el nombre descriptivo. Si el nombre ocupa dos líneas, únelas con espacio.

Reglas para propina/descuento:
- propina: porcentaje numérico (ej. 10 para 10%). 0 si no hay. Busca "PROPINA SUGERIDA X%" o similar.
- descuento: si hay filas de "Descuento %X" aplicadas a cada ítem, captura ese porcentaje aquí. 0 si no hay.
- descMode: "subtotal" si la propina se calcula sobre el monto original antes del descuento; "total" si no hay descuento o la propina va sobre el total final.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    console.error("Gemini error:", JSON.stringify(data));
    return res.status(response.status).json({ error: data.error?.message || "Gemini error" });
  }

  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("Gemini respuesta:", text.slice(0, 300));

  // Strip markdown code fences if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) text = jsonMatch[1];
  else text = text.trim();

  res.status(200).json({ content: [{ text }] });
}
