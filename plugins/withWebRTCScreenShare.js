const { withMainApplication } = require("@expo/config-plugins");

module.exports = function withWebRTCScreenShare(config) {
  return withMainApplication(config, (config) => {
    if (config.modResults.language !== "kt") {
      throw new Error(
        "withWebRTCScreenShare currently requires an Android Kotlin MainApplication.",
      );
    }

    let contents = config.modResults.contents;
    const serviceFlag =
      "    com.oney.WebRTCModule.WebRTCModuleOptions.getInstance().enableMediaProjectionService = true\n";

    if (!contents.includes("WebRTCModuleOptions.getInstance()")) {
      const onCreate = "  override fun onCreate() {\n    super.onCreate()\n";
      if (!contents.includes(onCreate)) {
        throw new Error(
          "withWebRTCScreenShare could not find MainApplication.onCreate().",
        );
      }
      contents = contents.replace(onCreate, `${onCreate}${serviceFlag}`);
    }

    config.modResults.contents = contents;
    return config;
  });
};
