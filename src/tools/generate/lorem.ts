import { randomInt } from "node:crypto";
import type { Tool } from "../types";
import { clampInt } from "../util";

const WORDS = (
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut " +
  "labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris " +
  "nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse " +
  "cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui " +
  "officia deserunt mollit anim id est laborum"
).split(" ");

const START = ["lorem", "ipsum", "dolor", "sit", "amet"];

const pick = () => WORDS[randomInt(WORDS.length)];

function words(n: number, first: boolean): string[] {
  const out = first ? START.slice(0, n) : [];
  while (out.length < n) {
    out.push(pick());
  }
  return out;
}

function capitalize(w: string[]): string[] {
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  return w;
}

function sentence(first: boolean): string {
  return `${capitalize(words(randomInt(8, 15), first)).join(" ")}.`;
}

function paragraph(first: boolean): string {
  const n = randomInt(4, 7);
  return Array.from({ length: n }, (_, i) => sentence(first && i === 0)).join(" ");
}

export const lorem: Tool = {
  id: "lorem",
  title: "Lorem Ipsum",
  category: "generate",
  icon: "whole-word",
  keywords: ["placeholder", "text", "dummy"],
  fields: [],
  options: [
    {
      id: "unit",
      label: "Unit",
      kind: "select",
      choices: ["words", "sentences", "paragraphs"],
      default: "paragraphs",
    },
    { id: "count", label: "Count", kind: "number", default: 3 },
  ],
  run(_fields, { unit, count }) {
    const n = clampInt(count, 1, 100, 3);
    const idx = Array.from({ length: n }, (_, i) => i === 0);
    if (unit === "words") {
      return { ok: true, output: capitalize(words(n, true)).join(" ") };
    }
    if (unit === "sentences") {
      return { ok: true, output: idx.map(sentence).join(" ") };
    }
    return { ok: true, output: idx.map(paragraph).join("\n\n") };
  },
};
