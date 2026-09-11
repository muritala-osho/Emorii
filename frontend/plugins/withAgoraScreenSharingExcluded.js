/**
 * Exclude Agora's optional screen-sharing module.
 *
 * Emorii uses Agora for voice/video calls but does not share or project the
 * device screen. The full-screen-sharing artifact adds the Android
 * FOREGROUND_SERVICE_MEDIA_PROJECTION permission to the merged manifest.
 */

const { withProjectBuildGradle } = require('@expo/config-plugins');

const GROOVY_MARKER = '// Emorii: exclude Agora screen sharing';
const GROOVY_BLOCK = `

${GROOVY_MARKER}
configurations.configureEach {
    exclude group: "io.agora.rtc", module: "full-screen-sharing"
}
`;

const KOTLIN_MARKER = '// Emorii: exclude Agora screen sharing';
const KOTLIN_BLOCK = `

${KOTLIN_MARKER}
configurations.configureEach {
    exclude(group = "io.agora.rtc", module = "full-screen-sharing")
}
`;

function withAgoraScreenSharingExcluded(config) {
  return withProjectBuildGradle(config, (config) => {
    const { language, contents } = config.modResults;
    const marker = language === 'kotlin' ? KOTLIN_MARKER : GROOVY_MARKER;

    if (!contents.includes(marker)) {
      config.modResults.contents +=
        language === 'kotlin' ? KOTLIN_BLOCK : GROOVY_BLOCK;
    }

    return config;
  });
}

module.exports = withAgoraScreenSharingExcluded;