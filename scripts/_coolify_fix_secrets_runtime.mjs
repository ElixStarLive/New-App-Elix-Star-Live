import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const token = process.env.COOLIFY_TOKEN;
const appId = process.env.COOLIFY_APP_ID || "iim33z8swqqezcllp7dnjxk3";
if (!token) {
  console.error("COOLIFY_TOKEN required");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

function parseDotEnv(filePath) {
  const out = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val.replace(/\\n/g, "\n");
  }
  return out;
}

const root = path.dirname(fileURLToPath(import.meta.url));
const envLocal = parseDotEnv(path.join(root, "../.env"));

const keys = [
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "APPLE_PRIVATE_KEY",
];

async function listEnvs() {
  const res = await fetch(`https://app.coolify.io/api/v1/applications/${appId}/envs`, { headers });
  if (!res.ok) throw new Error(`list envs ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.data || [];
}

async function deleteEnv(uuid) {
  const urls = [
    `https://app.coolify.io/api/v1/applications/${appId}/envs/${uuid}`,
    `https://app.coolify.io/api/v1/applications/${appId}/envs?uuid=${uuid}`,
  ];
  for (const url of urls) {
    for (const method of ["DELETE", "POST"]) {
      const res = await fetch(url, {
        method,
        headers,
        body: method === "POST" ? JSON.stringify({ uuid }) : undefined,
      });
      console.log(`DELETE-TRY ${method} ${url} -> ${res.status}`);
      if (res.ok) return true;
    }
  }
  // documented: Delete Env by UUID under applications
  const res = await fetch(`https://app.coolify.io/api/v1/applications/${appId}/envs/${uuid}`, {
    method: "DELETE",
    headers,
  });
  console.log(`DELETE final ${uuid} -> ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.ok;
}

async function createRuntimeEnv(key, value) {
  const body = {
    key,
    value,
    is_buildtime: false,
    is_runtime: true,
    is_multiline: true,
    is_preview: false,
    is_literal: false,
  };
  // PATCH /envs acts as upsert/create in this Coolify version
  const res = await fetch(`https://app.coolify.io/api/v1/applications/${appId}/envs`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`UPSERT ${key} -> ${res.status} len=${value.length} body=${text.slice(0, 160)}`);
  return res.ok;
}

async function updateBulk(items) {
  const urls = [
    `https://app.coolify.io/api/v1/applications/${appId}/envs/bulk`,
    `https://app.coolify.io/api/v1/applications/${appId}/envs`,
  ];
  for (const url of urls) {
    const res = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ data: items }),
    });
    console.log(`BULK ${url} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    if (res.ok) return true;
  }
  return false;
}

const existing = await listEnvs();
for (const key of keys) {
  const matches = existing.filter((e) => e.key === key);
  console.log(`EXISTING ${key} count=${matches.length}`);
  for (const m of matches) {
    console.log(`  uuid=${m.uuid} buildtime=${m.is_buildtime} len=${String(m.real_value ?? m.value ?? "").length}`);
  }
}

// Prefer bulk update with uuid if present
const bulk = [];
for (const key of keys) {
  const value = envLocal[key];
  if (!value) {
    console.error(`MISSING local ${key}`);
    process.exit(1);
  }
  const match = existing.find((e) => e.key === key);
  if (match) {
    bulk.push({
      uuid: match.uuid,
      key,
      value,
      is_buildtime: false,
      is_runtime: true,
      is_multiline: true,
      is_preview: false,
      is_literal: false,
    });
  }
}

if (bulk.length) {
  const ok = await updateBulk(bulk);
  if (!ok) {
    console.log("bulk failed; delete+recreate");
    for (const item of bulk) {
      await deleteEnv(item.uuid);
      await createRuntimeEnv(item.key, item.value);
    }
  }
}

// Ensure any missing keys created
const after = await listEnvs();
for (const key of keys) {
  const value = envLocal[key];
  const matches = after.filter((e) => e.key === key);
  if (!matches.length) {
    await createRuntimeEnv(key, value);
  } else {
    for (const m of matches) {
      const len = String(m.real_value ?? m.value ?? "").length;
      console.log(`AFTER ${key} uuid=${m.uuid} buildtime=${m.is_buildtime} runtime=${m.is_runtime} len=${len}`);
      if (m.is_buildtime || len < 20) {
        await deleteEnv(m.uuid);
        await createRuntimeEnv(key, value);
      }
    }
  }
}

const final = await listEnvs();
for (const key of keys) {
  const matches = final.filter((e) => e.key === key);
  for (const m of matches) {
    console.log(
      `FINAL ${key} buildtime=${m.is_buildtime} runtime=${m.is_runtime} len=${String(m.real_value ?? m.value ?? "").length}`,
    );
  }
}

const deploy = await fetch(`https://app.coolify.io/api/v1/deploy?uuid=${appId}&force=true`, {
  method: "GET",
  headers,
});
console.log(`DEPLOY -> ${deploy.status} ${(await deploy.text()).slice(0, 300)}`);
