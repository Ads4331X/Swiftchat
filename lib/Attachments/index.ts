import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Alert, Platform } from "react-native";
export async function launchCamera() {
  const permission = await ImagePicker.getCameraPermissionsAsync(); // gets the permission from the user

  if (!permission.granted) {
    if (!permission.canAskAgain) {
      Alert.alert(
        "Permission needed",
        "Please enable camera access in Settings.",
      );
    } else {
      Alert.alert("Camera permission is required!");
    }
    return null;
  }
  // launch native camera
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images", "videos"],
    quality: 1,
  });
  if (!result.canceled) {
    return result;
  }
  return null;
}

export async function launchGallery() {
  const permission = await ImagePicker.getMediaLibraryPermissionsAsync(); // gets the permission of the gallery from the user

  if (!permission.granted) {
    if (!permission.canAskAgain) {
      Alert.alert(
        "Permission needed",
        "Please enable media access in Settings.",
      );
    } else {
      Alert.alert("Media permission is required!");
    }
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: 1,
  });
  if (!result.canceled) {
    return result;
  }
  return null;
}

export async function launchFile() {
  const result = await DocumentPicker.getDocumentAsync();

  if (result.canceled) {
    return null;
  }

  if (Platform.OS === "web") {
    return result.output;
  }

  return result.assets;
}
