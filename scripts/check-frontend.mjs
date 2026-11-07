import console from "node:console";
import { readdirSync } from "node:fs";
const files = readdirSync("apps/web");
if (files.some((file) => file !== "README.md"))
  throw new Error("Frontend implementation is prohibited in this task");
console.log("Frontend placeholder only: passed");
