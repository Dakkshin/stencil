// A tool schema describes everything generic-server + generic-app need to know.

const FIELD_TYPES = new Set([
  "string", "text", "stringArray", "enum", "boolean", "number", "image", "repeat", "rank", "url",
]);

export function defineSchema(input) {
  if (!input || typeof input !== "object") throw new Error("schema must be an object");
  for (const key of ["tool", "title", "configDir"]) {
    if (!input[key]) throw new Error(`schema.${key} is required`);
  }
  const schema = {
    configLabel: "Config",
    assetDirs: {},
    outDirs: {},
    generate: { flags: [] },
    sections: [],
    ...input,
  };
  validateFields(schema.sections, schema.tool);
  return schema;
}

function validateFields(sections, tool) {
  const seen = new Set();
  const walk = (fields, where) => {
    for (const f of fields ?? []) {
      if (!f.path) throw new Error(`${tool}: field in ${where} is missing "path"`);
      if (!FIELD_TYPES.has(f.type)) throw new Error(`${tool}: field "${f.path}" has unknown type "${f.type}"`);
      const id = `${where}/${f.path}`;
      if (seen.has(id)) throw new Error(`${tool}: duplicate field "${f.path}" in ${where}`);
      seen.add(id);
      if (f.type === "repeat") {
        if (!Array.isArray(f.fields)) throw new Error(`${tool}: repeat "${f.path}" needs "fields"`);
        walk(f.fields, `${where}/${f.path}`);
      }
      if (f.type === "enum" && !Array.isArray(f.options)) {
        throw new Error(`${tool}: enum "${f.path}" needs "options"`);
      }
    }
  };
  sections.forEach((s, i) => walk(s.fields, s.id || `section${i}`));
}
