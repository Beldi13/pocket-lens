import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { join } from "node:path";
const folder = process.argv[2];
createServer((req, res) => {
  const name = req.url?.split("?")[0];
  if (!["/latest.json", "/0.3.1.exe"].includes(name)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "Content-Type",
    name.endsWith(".json") ? "application/json" : "application/octet-stream",
  );
  const stream = createReadStream(join(folder, name.slice(1)));
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}).listen(18749, "127.0.0.1");
