const fs = require("fs");
const p = process.argv[2];
let t = fs.readFileSync(p, "utf8");
const nt = t.replace(/<string name="elix-auth">[\s\S]*?<\/string>\s*/g, "");
fs.writeFileSync(p, nt);
process.stdout.write(
  JSON.stringify({
    removed: t !== nt,
    hasEmail: /login_saved_email/.test(nt),
    hasFlag: /login_save_details/.test(nt),
    hasPass: /login_saved_password/.test(nt),
  }),
);
