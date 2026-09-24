import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
export function pickAvatarImage() {}
export async function launchCamera() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();

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

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (!result.canceled) {
    return result;
  }
  return null;
}

export async function launchGallery() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

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
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (!result.canceled) {
    return result;
  }
  return null;
}
