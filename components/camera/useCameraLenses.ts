import { useCallback, useEffect, useMemo, useState } from "react";
import { useCameraDevice, useCameraDevices } from "react-native-vision-camera";
import type { CameraDevice } from "react-native-vision-camera";

/**
 * A zoom step the user can pick, together with the lens that has to be active
 * for it and the zoom to apply on that lens.
 */
export type CameraLensOption = {
  /** The value shown in the UI, e.g. `0.5` renders as "0.5x". */
  value: number;
  /** The Camera device that has to be active to use this step. */
  device: CameraDevice;
  /** The zoom to apply once `device` is active. */
  zoom: number;
};

const ULTRA_WIDE_ZOOM = 0.5;
const TELE_ZOOM_STEPS = [2, 3];

/**
 * How far a telephoto lens may be away from a zoom step (in percent) before we
 * stop treating it as the optical zoom for that step. Without this, a `5x`
 * telephoto lens would be offered as "2x".
 */
const TELE_ZOOM_TOLERANCE = 0.3;

/**
 * Finds the ultra-wide lens, if this camera really has one.
 *
 * On iOS every lens is also a device of its own (`builtInUltraWideCamera`), so
 * we can activate it directly. On Android the lens lives inside the logical
 * device and can only be reached by zooming out, which is only possible when
 * the device reports a zoom below `1`.
 */
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

/**
 * Finds the telephoto lens, but only on platforms that expose it as a device of
 * its own. Android switches to it automatically while zooming on the logical
 * device, so there is nothing to select there.
 */
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

/**
 * The optical zoom the telephoto lens provides relative to the main lens, or
 * `undefined` if the focal lengths are unknown.
 */
function telephotoZoomValue(
  telephoto: CameraDevice,
  mainDevice: CameraDevice,
): number | undefined {
  const telephotoFocal = telephoto.focalLength;
  const mainFocal = mainDevice.focalLength;

  if (!telephotoFocal || !mainFocal) return undefined;

  return telephotoFocal / mainFocal;
}

/**
 * Builds the zoom steps this camera can actually deliver: `0.5x` only when an
 * ultra-wide lens exists, `1x` for the main lens and the higher steps when the
 * camera can reach them, either optically or digitally.
 */
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

/**
 * Resolves the physical lenses of the camera at `facing` and keeps track of the
 * one that is currently active, so picking `0.5x` can activate the ultra-wide
 * lens instead of only changing the zoom.
 */
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
