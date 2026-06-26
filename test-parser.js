import fs from "fs";
import { parseMariBankEmail } from "./src/parsers/maribankEmailParser.js";

const text = fs.readFileSync("mari-sample.txt","utf8");

console.log(
  JSON.stringify(
    parseMariBankEmail(text),
    null,
    2
  )
);
