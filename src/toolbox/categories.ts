import type { Category } from "../tools/types";

export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: "encode", label: "Encode / Decode", icon: "symbol-key" },
  { id: "convert", label: "Format / Convert", icon: "arrow-swap" },
  { id: "generate", label: "Generate", icon: "sparkle" },
  { id: "inspect", label: "Inspect", icon: "search" },
];
