import { Platform } from "react-native";

let sodiumModule: any = null;

try {
  if (Platform.OS !== "web") {
    sodiumModule = require("react-native-libsodium");
  }
} catch {
  sodiumModule = null;
}

if (!sodiumModule) {
  sodiumModule = require("libsodium-wrappers");
}

export default sodiumModule.default ?? sodiumModule;
