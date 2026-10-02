import test from "node:test";
import assert from "node:assert/strict";
import { parseModelResponse } from "../api/analyze.js";

test("parses JSON returned inside a markdown fence and normalizes receipt items", () => {
  const result = parseModelResponse('```json\n{"items":[{"name":"Empanada","qty":2,"price":"5990"}],"propina":10}\n```');
  assert.deepEqual(result, {
    items: [{ name: "Empanada", qty: 2, price: 5990 }],
    propina: 10,
    descuento: 0,
    descMode: "total",
  });
});

test("rejects a successful but non-JSON model response so the API can try the next model", () => {
  assert.throws(() => parseModelResponse("No alcanzo a leer la boleta"), /no contiene JSON/);
});

test("rejects empty or unusable item lists so the API can try the next model", () => {
  assert.throws(() => parseModelResponse('{"items":[],"propina":0}'), /No se reconocieron productos/);
  assert.throws(() => parseModelResponse('{"items":[{"name":"","price":0}]}'), /No se reconocieron productos/);
});

test("extracts JSON when a model adds a short preamble", () => {
  const result = parseModelResponse('Resultado: {"items":[{"name":"Café","price":2500}]}');
  assert.equal(result.items[0].name, "Café");
  assert.equal(result.items[0].price, 2500);
});
