import { useCallback, useEffect, useMemo, useState } from "react";
import { useCameraDevice, useCameraDevices } from "react-native-vision-camera";
import type { CameraDevice } from "react-native-vision-camera";

// A zoom step the user can pick and the lens + zoom needed for it.
export type CameraLensOption = {
  value: number;
  device: CameraDevice;
  zoom: number;
};

const ULTRA_WIDE_ZOOM = 0.5;
const TELE_ZOOM_STEPS = [2, 3];

// How close a tele lens must be to a zoom step to count as that step (30%).
const TELE_ZOOM_TOLERANCE = 0.3;

// Find the ultra-wide lens: its own device on iOS, a zoom below 1x on Android.
function findUltraWide(
  devices: CameraDevice[],
  mainDevice: CameraDevice,
): CameraLensOption | undefined {
  const selectable = devices.find(
    (device) =>
      device.position === mainDevice.position &&
      device.type === "ultra-wide-angle" &&
      !device.isVirtualDevice,
  );

  if (selectable) {
    return { value: ULTRA_WIDE_ZOOM, device: selectable, zoom: 1 };
  }

  if (mainDevice.minZoom <= ULTRA_WIDE_ZOOM) {
    return {
      value: ULTRA_WIDE_ZOOM,
      device: mainDevice,
      zoom: ULTRA_WIDE_ZOOM,
    };
  }

  return undefined;
}

// Find the telephoto lens (only iOS exposes it as its own device).
function findTelephoto(
  devices: CameraDevice[],
  mainDevice: CameraDevice,
): CameraDevice | undefined {
  return devices.find(
    (device) =>
      device.position === mainDevice.position &&
      device.type === "telephoto" &&
      !device.isVirtualDevice,
  );
}

// Optical zoom of the tele lens relative to the main lens.
function telephotoZoomValue(
  telephoto: CameraDevice,
  mainDevice: CameraDevice,
): number | undefined {
  const telephotoFocal = telephoto.focalLength;
  const mainFocal = mainDevice.focalLength;

  if (!telephotoFocal || !mainFocal) return undefined;

  return telephotoFocal / mainFocal;
}

// Build the zoom steps this camera can do: 0.5x, 1x and the higher steps.
function buildZoomOptions(
  devices: CameraDevice[],
  mainDevice: CameraDevice,
): CameraLensOption[] {
  const options: CameraLensOption[] = [];

  const ultraWide = findUltraWide(devices, mainDevice);

  if (ultraWide) {
    options.push(ultraWide);
  }

  options.push({ value: 1, device: mainDevice, zoom: 1 });

  const telephoto = findTelephoto(devices, mainDevice);
  const telephotoZoom = telephoto
    ? telephotoZoomValue(telephoto, mainDevice)
    : undefined;

  for (const value of TELE_ZOOM_STEPS) {
    const isOptical =
      telephoto != null &&
      telephotoZoom != null &&
      Math.abs(telephotoZoom - value) / value <= TELE_ZOOM_TOLERANCE;

    if (isOptical) {
      options.push({ value, device: telephoto!, zoom: 1 });
      continue;
    }

    if (mainDevice.maxZoom >= value) {
      options.push({ value, device: mainDevice, zoom: value });
    }
  }

  return options;
}

// Resolve the lenses for the given camera and track the active one.
export function useCameraLenses(facing: "back" | "front") {
  const devices = useCameraDevices();
  const mainDevice = useCameraDevice(facing);

  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  useEffect(() => {
    setActiveDeviceId(null);
  }, [mainDevice?.id]);

  const activeDevice = useMemo(() => {
    if (mainDevice == null) return undefined;
    if (activeDeviceId == null) return mainDevice;

    return devices.find((device) => device.id === activeDeviceId) ?? mainDevice;
  }, [activeDeviceId, devices, mainDevice]);

  const zoomOptions = useMemo(
    () => (mainDevice == null ? [] : buildZoomOptions(devices, mainDevice)),
    [devices, mainDevice],
  );

  const setActiveDevice = useCallback((device: CameraDevice | null) => {
    setActiveDeviceId(device?.id ?? null);
  }, []);

  return { activeDevice, mainDevice, zoomOptions, setActiveDevice };
}
