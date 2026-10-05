const { withProjectBuildGradle } = require("@expo/config-plugins");

const MEDIA3_GROUP = "androidx.media3";

function buildBlock(version) {
  return `
allprojects {
  configurations.configureEach {
    resolutionStrategy.eachDependency { details ->
      if (details.requested.group == "${MEDIA3_GROUP}") {
        details.useVersion "${version}"
      }
    }
  }
}
`;
}

module.exports = function withMedia3Version(config, { version = "1.9.0" } = {}) {
  if (typeof config !== "object" || config === null) {
    throw new Error("withMedia3Version: invalid config");
  }

  if (typeof version !== "string" || version.length === 0) {
    throw new Error("withMedia3Version: expected a version string");
  }

  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      return config;
    }

    const contents = config.modResults.contents;

    if (contents.includes(`details.requested.group == "${MEDIA3_GROUP}"`)) {
      return config;
    }

    config.modResults.contents = `${contents.replace(/\s*$/, "\n")}${buildBlock(version)}`;
    return config;
  });
};