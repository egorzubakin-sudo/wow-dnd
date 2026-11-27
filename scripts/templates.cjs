const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "data", "templates");
fs.mkdirSync(out, { recursive: true });
const context = vm.createContext({ actions: [], structuredClone });
for (const file of [
  "01-core.js",
  "10-domain.js",
  "20-domain.js",
  "30-domain.js",
  "40-domain.js",
  "64-trade-catalog-domain.js",
  "65-trade-domain.js",
  "66-content-domain.js",
  "41-workshop-ui.js",
]) {
  let code = fs.readFileSync(path.join(root, "src", file), "utf8");
  for (const key of ["rules", "demo"])
    code = code.replace(
      new RegExp("/\\*BUNDLED_" + key.toUpperCase() + "\\*/\\s*null"),
      () => fs.readFileSync(path.join(root, "data", key + ".json"), "utf8"),
    );
  code = code.replace("/*BUNDLED_CONTENT*/ null", () => JSON.stringify({
    bookEquipment: JSON.parse(fs.readFileSync(path.join(root, "content/core/book-equipment.json"), "utf8")),
    tradeLoop: JSON.parse(fs.readFileSync(path.join(root, "content/examples/trade-loop.json"), "utf8")),
  }));
  vm.runInContext(code, context);
}
const output = vm.runInContext(
  `({schema:schemaDoc(),tables:Object.keys(tables).map(k=>{
 const names=columns(k).map(c=>c.name),r=sampleRow(k); rowFrom(k,r);
 return {k,empty:csvWrite([],names),example:csvWrite([r],names),json:JSON.stringify({[k]:[r]},null,2)};
})})`,
  context,
);
for (const { k, empty, example, json } of output.tables) {
  fs.writeFileSync(path.join(out, k + ".csv"), empty);
  fs.writeFileSync(path.join(out, k + ".example.csv"), example);
  fs.writeFileSync(path.join(out, k + ".example.json"), json + "\n");
  fs.writeFileSync(
    path.join(out, k + ".json"),
    JSON.stringify({ [k]: [] }) + "\n",
  );
}
fs.writeFileSync(
  path.join(root, "data", "schema.json"),
  JSON.stringify(output.schema, null, 2) + "\n",
);
