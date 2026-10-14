const TYPE_DEFS_RE = /\/\* TYPE DEFS START \*\/[\s\S]*?\/\* TYPE DEFS END \*\//;

function typeDefsBlock(typeDef: string): string {
  return `/* TYPE DEFS START */
// Type definitions for the injected global 'input'
interface InputData {
    raw: string;
    data: ${typeDef};
}
/* TYPE DEFS END */`;
}

export function transformTemplate(typeDef: string): string {
  return `
import * as path from 'path';

${typeDefsBlock(typeDef)}

// Declare the global 'input' variable so TypeScript knows about it
declare const input: InputData;

/**
 * Transformation Script
 * console.log is fine here: it goes to the JScratch output channel, not the result.
 */
export function transform(): any {
    // TODO: Implement your transformation logic
    // Example: return input.data.map((item: any) => item.id);
    
    if (typeof input !== 'undefined' && input.data) {
        return input.data;
    }
    return {};
}
`;
}

/** Swap the TYPE DEFS block in `source`. Undefined if there is no block. */
export function replaceTypeDefs(
  source: string,
  typeDef: string,
): string | undefined {
  if (!TYPE_DEFS_RE.test(source)) {
    return undefined;
  }
  // function replacer: typeDef may contain `$&`-style sequences
  return source.replace(TYPE_DEFS_RE, () => typeDefsBlock(typeDef));
}
