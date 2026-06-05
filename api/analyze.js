export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: "Missing base64 or mimeType" });

  const apiKey = process.env.OCR_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OCR API key not configured" });

  // Llamar a OCR.space
  const formData = new URLSearchParams();
  formData.append("apikey", apiKey);
  formData.append("base64Image", `data:${mimeType};base64,${base64}`);
  formData.append("language", "spa");
  formData.append("isTable", "false");
  formData.append("OCREngine", "2"); // Engine 2 es mejor para fotos
  formData.append("scale", "true");
  formData.append("detectOrientation", "true");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const data = await response.json();

  if (data.IsErroredOnProcessing) {
    return res.status(500).json({ error: data.ErrorMessage?.[0] || "OCR error" });
  }

  const text = data.ParsedResults?.[0]?.ParsedText || "";
  res.status(200).json({ text });
}
