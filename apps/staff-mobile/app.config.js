module.exports = ({ config }) => {
  const googleNavigationApiKey = String(
    process.env.GOOGLE_NAVIGATION_API_KEY || "",
  ).trim();

  return {
    ...config,
    plugins: [
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
        "./plugins/withGoogleNavigation",
        {
          apiKey: googleNavigationApiKey,
        },
      ],
    ],
    extra: {
      ...(config.extra || {}),
      googleNavigationConfigured: Boolean(googleNavigationApiKey),
    },
  };
};
