import "server-only";
import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("ejecuta pruebas con jsdom y jest-dom", () => {
    const el = document.createElement("div");
    el.textContent = "hola";
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("hola");
  });
});
