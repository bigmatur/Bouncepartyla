const {
  withAndroidManifest,
  withAppBuildGradle,
  withAppDelegate,
  withGradleProperties,
} = require("expo/config-plugins");

function requireApiKey(apiKey) {
  const value = String(apiKey || "").trim();
  if (!value) {
    throw new Error(
      "GOOGLE_NAVIGATION_API_KEY is required for native Staff App builds. Set it in your shell/EAS environment before running expo prebuild or EAS build.",
    );
  }
  return value;
}

function getMainApplicationNode(manifest) {
  const applications = manifest?.application;

  if (!Array.isArray(applications) || applications.length === 0) {
    throw new Error(
      "AndroidManifest.xml is missing an <application> element required for Google Navigation configuration.",
    );
  }

  // Expo SDK 54 can generate android:name through a placeholder/value that does
  // not end in `.MainApplication` during the manifest mod phase. Expo's
  // getMainApplicationOrThrow helper filters by that suffix and can therefore
  // reject an otherwise valid generated manifest. For metadata we only need the
  // single app-level <application> node, which is the first generated node.
  return applications[0];
}

function upsertAndroidMetaData(application, name, value) {
  const existing = application["meta-data"] || [];
  const filtered = existing.filter((item) => item?.$?.["android:name"] !== name);
  filtered.push({
    $: {
      "android:name": name,
      "android:value": value,
    },
  });
  application["meta-data"] = filtered;
}

function withAndroidNavigationManifest(config, apiKey) {
  return withAndroidManifest(config, (mod) => {
    const application = getMainApplicationNode(mod.modResults.manifest);
    upsertAndroidMetaData(application, "com.google.android.geo.API_KEY", apiKey);
    return mod;
  });
}

function withNavigationGradleProperties(config) {
  return withGradleProperties(config, (mod) => {
    const props = mod.modResults;

    function upsert(key, value) {
      const entry = props.find((item) => item.type === "property" && item.key === key);
      if (entry) {
        entry.value = value;
      } else {
        props.push({ type: "property", key, value });
      }
    }

    upsert("newArchEnabled", "true");
    upsert("android.enableJetifier", "true");

    return mod;
  });
}

function withNavigationDesugaring(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error("Staff App Google Navigation plugin currently expects Groovy app/build.gradle.");
    }

    let source = mod.modResults.contents;

    if (!source.includes("coreLibraryDesugaringEnabled true")) {
      const compileOptionsPattern = /compileOptions\s*\{/;

      if (compileOptionsPattern.test(source)) {
        source = source.replace(
          compileOptionsPattern,
          "compileOptions {\n        coreLibraryDesugaringEnabled true",
        );
      } else {
        // Expo SDK 54's default Android app/build.gradle has no compileOptions
        // block. Insert one inside android {} before defaultConfig instead of
        // treating its absence as an error.
        const defaultConfigPattern = /(^\s*)defaultConfig\s*\{/m;
        const defaultConfigMatch = source.match(defaultConfigPattern);

        if (!defaultConfigMatch) {
          throw new Error(
            "Could not find Android defaultConfig block for Navigation SDK desugaring.",
          );
        }

        const indent = defaultConfigMatch[1] || "    ";
        const compileOptions = [
          `${indent}compileOptions {`,
          `${indent}    coreLibraryDesugaringEnabled true`,
          `${indent}    sourceCompatibility JavaVersion.VERSION_17`,
          `${indent}    targetCompatibility JavaVersion.VERSION_17`,
          `${indent}}`,
          "",
        ].join("\n");

        source = source.replace(defaultConfigPattern, `${compileOptions}${defaultConfigMatch[0]}`);
      }
    }

    if (!source.includes("com.android.tools:desugar_jdk_libs_nio")) {
      const dependenciesPattern = /dependencies\s*\{/;
      if (!dependenciesPattern.test(source)) {
        throw new Error("Could not find Android dependencies block for Navigation SDK desugaring.");
      }
      source = source.replace(
        dependenciesPattern,
        "dependencies {\n    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs_nio:2.1.5'",
      );
    }

    mod.modResults.contents = source;
    return mod;
  });
}

function withIosGoogleMapsKey(config, apiKey) {
  return withAppDelegate(config, (mod) => {
    let source = mod.modResults.contents;

    if (mod.modResults.language === "swift") {
      if (!source.includes("import GoogleMaps")) {
        const importAnchor = source.match(/^import\s+Expo[\w\s]*$/m)?.[0] || "import Expo";
        if (!source.includes(importAnchor)) {
          throw new Error("Could not find Swift import anchor in AppDelegate.swift.");
        }
        source = source.replace(importAnchor, `${importAnchor}\nimport GoogleMaps`);
      }

      if (!source.includes("GMSServices.provideAPIKey")) {
        const methodPattern = /(didFinishLaunchingWithOptions launchOptions:[\s\S]*?\) -> Bool \{)/m;
        if (!methodPattern.test(source)) {
          throw new Error("Could not find iOS didFinishLaunchingWithOptions method in AppDelegate.swift.");
        }
        source = source.replace(
          methodPattern,
          `$1\n    GMSServices.provideAPIKey(${JSON.stringify(apiKey)})`,
        );
      }
    } else {
      if (!source.includes("#import <GoogleMaps/GoogleMaps.h>")) {
        source = `#import <GoogleMaps/GoogleMaps.h>\n${source}`;
      }

      if (!source.includes("[GMSServices provideAPIKey:")) {
        const objcPattern = /(didFinishLaunchingWithOptions:[\s\S]*?\{)/m;
        if (!objcPattern.test(source)) {
          throw new Error("Could not find iOS didFinishLaunchingWithOptions method in AppDelegate.");
        }
        source = source.replace(
          objcPattern,
          `$1\n  [GMSServices provideAPIKey:@${JSON.stringify(apiKey)}];`,
        );
      }
    }

    mod.modResults.contents = source;
    return mod;
  });
}

module.exports = function withGoogleNavigation(config, props = {}) {
  const apiKey = requireApiKey(props.apiKey);

  config = withAndroidNavigationManifest(config, apiKey);
  config = withNavigationGradleProperties(config);
  config = withNavigationDesugaring(config);
  config = withIosGoogleMapsKey(config, apiKey);

  return config;
};
