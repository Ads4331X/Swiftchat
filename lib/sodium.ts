let sodiumModule: any;

if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
  sodiumModule = require("./sodium.native").default;
} else {
  sodiumModule = require("./sodium.web").default;
}

export default sodiumModule;
