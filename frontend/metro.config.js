// const { getDefaultConfig } = require("expo/metro-config");
// const { withNativeWind } = require('nativewind/metro');
 
// const config = getDefaultConfig(__dirname)
 
// module.exports = withNativeWind(config, { input: './global.css' })
//below this old


    //const { getDefaultConfig } = require("expo/metro-config");
    //const { withNativeWind } = require('nativewind/metro');

    //const config = getDefaultConfig(__dirname);

    //module.exports = withNativeWind(config, { input: './global.css' });

    const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// On web only, replace react-native-maps with an empty module
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-maps") {
    return { type: "empty" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });