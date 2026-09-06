/**
 * Legt eine .env an und erzeugt die beiden Pflicht-Geheimnisse.
 * Eine vorhandene .env wird nicht angefasst.
 */
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const secret = () => randomBytes(48).toString("base64");

if (existsSync(".env")) {
  console.log(".env besteht bereits – unverändert gelassen.");
  process.exit(0);
}

copyFileSync(".env.example", ".env");
const füllen = (inhalt, schlüssel) =>
  inhalt.replace(new RegExp(`^${schlüssel}=""$`, "m"), `${schlüssel}="${secret()}"`);

let inhalt = readFileSync(".env", "utf8");
for (const schlüssel of ["ENCRYPTION_KEY", "SESSION_SECRET"]) inhalt = füllen(inhalt, schlüssel);
writeFileSync(".env", inhalt);

console.log(".env angelegt, ENCRYPTION_KEY und SESSION_SECRET erzeugt.");
