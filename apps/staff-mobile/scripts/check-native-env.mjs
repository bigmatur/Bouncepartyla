const required = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "GOOGLE_NAVIGATION_API_KEY",
];

const missing = required.filter((name) => !String(process.env[name] || "").trim());

if (missing.length > 0) {
  console.error("\nStaff Mobile native build is missing required environment values:\n");
  for (const name of missing) console.error(`  - ${name}`);
  console.error(
    "\nSet them in apps/staff-mobile/.env.local for local work or in the EAS build environment before creating a native build.\n",
  );
  process.exit(1);
}

const supabaseUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL);
if (!/^https:\/\/.+\.supabase\.co\/?$/i.test(supabaseUrl)) {
  console.warn(
    "Warning: EXPO_PUBLIC_SUPABASE_URL does not look like a standard hosted Supabase URL.",
  );
}

if (String(process.env.GOOGLE_NAVIGATION_API_KEY).length < 20) {
  console.warn("Warning: GOOGLE_NAVIGATION_API_KEY looks unusually short.");
}

console.log("Staff Mobile native environment: OK");
console.log("iOS bundle id: com.bouncepartyla.staff");
console.log("Android package: com.bouncepartyla.staff");
console.log("Navigation key will be embedded only into generated native build files.");
