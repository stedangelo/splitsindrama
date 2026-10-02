const SKIP_LINE = /^(?:total|subtotal|propina|tip|descuento|discount|iva|impuesto|servicio|boleta|folio|rut|fecha|hora|mesa|garz[oó]n|caja|ticket|gracias|vuelto|efectivo|tarjeta|d[eé]bito|cr[eé]dito|transbank)\b/i;
const PRICE_AT_END = /(?:^|\s)(?:\$\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{3,6})\s*$/;

function parseItemName(rawName) {
  let name = rawName.replace(/^(?:JM:|Agr\.?|AGR\.?)\s*/i, "").trim();
  let qty = 1;
  const quantity = name.match(/^(?:(\d+)\s*[x×]\s*|[x×]\s*(\d+)\s+)/i);
  if (quantity) {
    qty = Number(quantity[1] || quantity[2]) || 1;
    name = name.slice(quantity[0].length).trim();
  }
  return { name, qty };
}

export function parsePastedReceipt(text) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const items = [];
  let pendingName = "";
  let tip = null;

  for (const line of lines) {
    const tipMatch = line.match(/propina(?:\s+sugerida)?\s*[:\-]?\s*(\d{1,2})\s*%/i);
    if (tipMatch) tip = Math.min(100, Number(tipMatch[1]));

    if (SKIP_LINE.test(line)) {
      pendingName = "";
      continue;
    }

    const priceMatch = line.match(PRICE_AT_END);
    if (priceMatch) {
      const price = Number(priceMatch[1].replace(/[.,]/g, ""));
      const sameLineName = line.slice(0, priceMatch.index).trim().replace(/\$\s*$/, "").trim();
      const rawName = [pendingName, sameLineName].filter(Boolean).join(" ");
      const { name, qty } = parseItemName(rawName);
      if (name.length >= 2 && price >= 100 && price <= 500000) {
        items.push({ name, qty, price });
      }
      pendingName = "";
      continue;
    }

    if (/^\$?\s*\d[\d.,]*\s*$/.test(line)) {
      // A standalone amount without a product name is likely a total or tip.
      pendingName = "";
      continue;
    }

    pendingName = [pendingName, line].filter(Boolean).join(" ");
  }

  return { items, tip };
}
