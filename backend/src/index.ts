import { env } from "./config.js";
import { buildApp } from "./app.js";

const app = await buildApp();

app.listen({
  port: env.PORT,
  host: env.HOST
});
