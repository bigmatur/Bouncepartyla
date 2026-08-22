import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const androidManifest = path.join(
  root,
  "android/app/src/main/AndroidManifest.xml",
);
const androidBuildGradle = path.join(root, "android/app/build.gradle");
const androidGradleProperties = path.join(root, "android/gradle.properties");
const iosDir = path.join(root, "ios");

const failures = [];
const notes = [];

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    failures.push(`${label} is missing: ${path.relative(root, filePath)}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function expectText(source, needle, label) {
  if (!source.includes(needle)) {
    failures.push(`${label} is missing expected text: ${needle}`);
  }
}

const manifest = requireFile(androidManifest, "Android manifest");
const appGradle = requireFile(androidBuildGradle, "Android app build.gradle");
const gradleProperties = requireFile(
  androidGradleProperties,
  "Android gradle.properties",
);

if (manifest) {
  expectText(
    manifest,
    "com.google.android.geo.API_KEY",
    "Android Google Navigation API key metadata",
  );
}

if (appGradle) {
  expectText(
    appGradle,
    "coreLibraryDesugaringEnabled true",
    "Android core library desugaring",
  );
  expectText(
    appGradle,
    "com.android.tools:desugar_jdk_libs_nio",
    "Android desugar_jdk_libs_nio dependency",
  );
}

if (gradleProperties) {
  expectText(gradleProperties, "newArchEnabled=true", "React Native New Architecture");
  expectText(gradleProperties, "android.enableJetifier=true", "Android Jetifier");
}

if (!fs.existsSync(iosDir)) {
  failures.push("iOS native project is missing. Run npm run prebuild:clean first.");
} else {
  const candidates = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "Pods") continue;
        walk(absolute);
      } else if (/AppDelegate\.(swift|m|mm)$/.test(entry.name)) {
        candidates.push(absolute);
      }
    }
  }

  walk(iosDir);

  if (candidates.length === 0) {
    failures.push("Could not find generated iOS AppDelegate.");
  } else {
    const appDelegate = fs.readFileSync(candidates[0], "utf8");
    expectText(appDelegate, "GoogleMaps", "iOS GoogleMaps import");
    expectText(appDelegate, "GMSServices.provideAPIKey", "iOS Google Maps API key initialization");
    notes.push(`iOS AppDelegate: ${path.relative(root, candidates[0])}`);
  }
}

if (failures.length > 0) {
  console.error("\nStaff Mobile native project verification FAILED:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\nRun `npm run prebuild:clean` with GOOGLE_NAVIGATION_API_KEY set, then run this verifier again.\n",
  );
  process.exit(1);
}

console.log("\nStaff Mobile native project verification: OK");
console.log("- Android Navigation SDK configuration is present.");
console.log("- React Native New Architecture is enabled.");
console.log("- iOS Google Maps initialization is present.");
for (const note of notes) console.log(`- ${note}`);
console.log();
