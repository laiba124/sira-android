#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.sira-import") });

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  })
);

const CSV_PATH = path.resolve(
  process.cwd(),
  String(args.csv || "SIRA_GAL_Consolidated_User_Profiles_Password_At123.csv")
);
const LIMIT = args.limit ? Number(args.limit) : null;
const START = args.start ? Number(args.start) : 0;
const DELAY_MS = args.delay ? Number(args.delay) : 175;
const DRY_RUN = Boolean(args["dry-run"]);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

if (!SUPABASE_URL) fail("SUPABASE_URL is missing from .env.sira-import");
if (!SUPABASE_SECRET_KEY) fail("SUPABASE_SECRET_KEY is missing from .env.sira-import");
if (!fs.existsSync(CSV_PATH)) fail(`CSV file not found: ${CSV_PATH}`);
if (!Number.isInteger(START) || START < 0) fail("--start must be zero or a positive integer");
if (LIMIT !== null && (!Number.isInteger(LIMIT) || LIMIT <= 0)) {
  fail("--limit must be a positive integer");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(row) {
  const username = String(row.username || "").trim().toLowerCase();
  const password = String(row.password || "");
  const fullName = String(row.full_name || "").trim();
  const company = String(row.company || "Zong").trim() || "Zong";
  const mobileNumber = String(row.mobile_number || "").trim();
  const jobTitle = String(row.job_title || row.role || "").trim();
  const role = String(row.role || row.job_title || "Field Engineer").trim();

  return {
    username,
    password,
    full_name: fullName,
    company,
    mobile_number: mobileNumber,
    role,
    job_title: jobTitle,
  };
}

function validate(row, lineNumber) {
  if (!row.username || !row.username.endsWith("@sira.net")) {
    throw new Error(`Line ${lineNumber}: invalid @sira.net username`);
  }

  // Same policy as the app and the sira-user-admin Edge Function. Imported
  // passwords are temporary: each user must change it at first sign-in.
  const local = row.username.split("@", 1)[0];
  const password = String(row.password || "");
  const strong =
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password) &&
    !(local.length >= 3 && password.toLowerCase().includes(local));
  if (!strong) {
    throw new Error(
      `Line ${lineNumber}: password must be 12+ characters with upper, lower, number and symbol, and must not contain the username`
    );
  }

  if (!row.full_name) throw new Error(`Line ${lineNumber}: full_name is blank`);
  if (!row.company) throw new Error(`Line ${lineNumber}: company is blank`);
  if (!row.role) throw new Error(`Line ${lineNumber}: role is blank`);
}

function isRetryable(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || "").toLowerCase();

  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("rate limit")
  );
}

async function withRetry(label, operation, attempts = 5) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) break;

      const wait = Math.min(8000, 500 * 2 ** (attempt - 1));
      console.warn(`  ${label} retry ${attempt}/${attempts - 1} after ${wait}ms`);
      await sleep(wait);
    }
  }

  throw lastError;
}

async function loadExistingAuthUsers() {
  const usersByEmail = new Map();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data } = await withRetry(
      `List Auth users page ${page}`,
      () => supabase.auth.admin.listUsers({ page, perPage })
    );

    const users = data?.users || [];
    for (const user of users) {
      if (user.email) usersByEmail.set(user.email.toLowerCase(), user);
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return usersByEmail;
}

async function profileExists(userId) {
  const { data } = await withRetry("Check existing profile", () =>
    supabase
      .from("sira_user_profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle()
  );

  return Boolean(data?.id);
}

function profilePayload(userId, row) {
  return {
    id: userId,
    full_name: row.full_name,
    company: row.company,
    mobile_number: row.mobile_number,
    role: row.role,
    job_title: row.job_title || null,
    username: row.username,
  };
}

async function ensureProfileForExistingUser(user, row) {
  if (await profileExists(user.id)) {
    return { status: "SKIPPED_EXISTING_AUTH_AND_PROFILE", auth_user_id: user.id };
  }

  await withRetry("Insert missing profile", () =>
    supabase.from("sira_user_profiles").insert(profilePayload(user.id, row))
  );

  return { status: "PROFILE_CREATED_FOR_EXISTING_AUTH", auth_user_id: user.id };
}

async function createNewUserAndProfile(row) {
  let createdUser = null;

  try {
    const { data } = await withRetry("Create Auth user", () =>
      supabase.auth.admin.createUser({
        email: row.username,
        password: row.password,
        email_confirm: true,
        app_metadata: { must_change_password: true },
        user_metadata: {
          full_name: row.full_name,
          company: row.company,
          job_title: row.job_title,
        },
      })
    );

    createdUser = data?.user;
    if (!createdUser?.id) throw new Error("Auth API did not return a user ID");

    await withRetry("Create profile", () =>
      supabase
        .from("sira_user_profiles")
        .upsert(profilePayload(createdUser.id, row), { onConflict: "id" })
    );

    return { status: "CREATED", auth_user_id: createdUser.id };
  } catch (error) {
    if (createdUser?.id) {
      try {
        await withRetry(
          "Rollback Auth user",
          () => supabase.auth.admin.deleteUser(createdUser.id),
          3
        );
      } catch (rollbackError) {
        throw new Error(
          `${error.message}; rollback also failed: ${rollbackError.message}`
        );
      }
    }

    throw error;
  }
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const parsed = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: false,
    trim: false,
  });

  const allRows = parsed.map(normalize);
  allRows.forEach((row, index) => validate(row, index + 2));

  const selectedRows = allRows.slice(
    START,
    LIMIT === null ? undefined : START + LIMIT
  );

  console.log("\nSIRA GAL IMPORT");
  console.log(`CSV:       ${CSV_PATH}`);
  console.log(`Rows:      ${allRows.length}`);
  console.log(`Selected:  ${selectedRows.length}`);
  console.log(`Start:     ${START}`);
  console.log(`Delay:     ${DELAY_MS}ms`);
  console.log(`Dry run:   ${DRY_RUN ? "YES" : "NO"}`);
  console.log("Passwords will not be printed.\n");

  if (DRY_RUN) {
    console.log("Validation passed. No Supabase changes were made.");
    return;
  }

  console.log("Loading existing Supabase Auth users...");
  const usersByEmail = await loadExistingAuthUsers();
  console.log(`Existing Auth users found: ${usersByEmail.size}\n`);

  const results = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let profileCreated = 0;

  for (let i = 0; i < selectedRows.length; i += 1) {
    const row = selectedRows[i];
    const absoluteIndex = START + i + 1;
    const prefix = `[${i + 1}/${selectedRows.length}] ${row.username}`;

    try {
      const existing = usersByEmail.get(row.username);
      const result = existing
        ? await ensureProfileForExistingUser(existing, row)
        : await createNewUserAndProfile(row);

      if (result.status === "CREATED") {
        created += 1;
        usersByEmail.set(row.username, {
          id: result.auth_user_id,
          email: row.username,
        });
      } else if (result.status === "PROFILE_CREATED_FOR_EXISTING_AUTH") {
        profileCreated += 1;
      } else {
        skipped += 1;
      }

      results.push({
        row_number: absoluteIndex,
        username: row.username,
        full_name: row.full_name,
        status: result.status,
        auth_user_id: result.auth_user_id || "",
        error: "",
      });

      console.log(`${prefix} -> ${result.status}`);
    } catch (error) {
      failed += 1;
      const message = String(error?.message || error);

      results.push({
        row_number: absoluteIndex,
        username: row.username,
        full_name: row.full_name,
        status: "FAILED",
        auth_user_id: "",
        error: message,
      });

      console.error(`${prefix} -> FAILED: ${message}`);
    }

    if (i < selectedRows.length - 1 && DELAY_MS > 0) {
      await sleep(DELAY_MS);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.resolve(process.cwd(), `sira-import-report-${stamp}.csv`);
  fs.writeFileSync(reportPath, stringify(results, { header: true }), "utf8");

  console.log("\nIMPORT COMPLETE");
  console.log(`Created new users:                  ${created}`);
  console.log(`Created profiles for existing Auth: ${profileCreated}`);
  console.log(`Skipped existing users:             ${skipped}`);
  console.log(`Failed:                             ${failed}`);
  console.log(`Report: ${reportPath}\n`);

  if (failed > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error("\nFATAL ERROR:", error?.message || error);
  process.exit(1);
});
