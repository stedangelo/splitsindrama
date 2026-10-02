import test from "node:test";
import assert from "node:assert/strict";
import { parsePastedReceipt } from "../src/parseReceiptText.js";

test("parses pasted Chilean receipt text, wrapped names, quantity and suggested tip", () => {
  const parsed = parsePastedReceipt(`2 x Coca Cola Zero
5.800
Catrina
6.900
Guacamole Tradicion
12.900
Carbonara
18.900
Spaguetti

Atun
14.900
Arroz con Choclo
4.900
Crema de Zapallo
9.900
Tiramisu
9.900
TOTAL
84.100
Propina sugerida 10%
8.410
Total con Propina
02.510`);

  assert.deepEqual(parsed.items, [
    { name: "Coca Cola Zero", qty: 2, price: 5800 },
    { name: "Catrina", qty: 1, price: 6900 },
    { name: "Guacamole Tradicion", qty: 1, price: 12900 },
    { name: "Carbonara", qty: 1, price: 18900 },
    { name: "Spaguetti Atun", qty: 1, price: 14900 },
    { name: "Arroz con Choclo", qty: 1, price: 4900 },
    { name: "Crema de Zapallo", qty: 1, price: 9900 },
    { name: "Tiramisu", qty: 1, price: 9900 },
  ]);
  assert.equal(parsed.tip, 10);
});

test("does not treat totals or a standalone tip as products", () => {
  const parsed = parsePastedReceipt("Papas fritas\n3.500\nTOTAL\n3.500\nPropina sugerida 10%\n350");
  assert.deepEqual(parsed.items, [{ name: "Papas fritas", qty: 1, price: 3500 }]);
  assert.equal(parsed.tip, 10);
});
