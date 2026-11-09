module.exports = ({ config }) => {
  const googleNavigationApiKey = String(
    process.env.GOOGLE_NAVIGATION_API_KEY || "",
  ).trim();

  const plugins = [
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 24,
        },
        ios: {
          deploymentTarget: "16.0",
        },
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow Bounce Party LA Staff to access photos for delivery and pickup proof.",
        cameraPermission:
          "Allow Bounce Party LA Staff to use the camera for delivery and pickup proof photos.",
      },
    ],
    "@react-native-community/datetimepicker",
  ];

  if (googleNavigationApiKey) {
    plugins.push([
      "./plugins/withGoogleNavigation",
      {
        apiKey: googleNavigationApiKey,
      },
    ]);
  }

  return {
    ...config,
    updates: {
      url: "https://u.expo.dev/19be6ae1-98f7-4d57-a7c5-0107dbbf90e6",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    plugins,
    extra: {
      ...(config.extra || {}),
      googleNavigationConfigured: Boolean(googleNavigationApiKey),
    },
  };
};
