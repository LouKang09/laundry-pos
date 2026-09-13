import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
const pg = await PGlite.create();
const server = new PGLiteSocketServer({
  db: pg,
  host: "127.0.0.1",
  port: 5544,
});
await server.start();
const url =
  "postgresql://postgres:postgres@127.0.0.1:5544/postgres?connection_limit=1";
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: url,
  TEST_DATABASE_URL: url,
  APP_URL: "http://localhost:3000",
};
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("npm", args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Command failed: " + args.join(" "))),
    );
  });
let failed = false;
try {
  await run(["run", "db:migrate"]);
  await run(["test"]);
  await pg.exec("DEALLOCATE ALL");
  await run(["run", "test:ui"]);
} catch (e) {
  console.error(e.message);
  failed = true;
} finally {
  await server.stop();
  await pg.close();
}
process.exit(failed ? 1 : 0);
