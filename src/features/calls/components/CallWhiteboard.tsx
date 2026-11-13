import Feather from "@expo/vector-icons/Feather";
import * as ScreenOrientation from "expo-screen-orientation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeTouchEvent,
} from "react-native";

import {
  clearCallWhiteboard,
  onCallWhiteboardCleared,
  onCallWhiteboardStroke,
  publishCallWhiteboardStroke,
  type CallWhiteboardStroke as Stroke,
} from "@/core/socket/call-signaling";

const STROKE_COLOR = "#17212B";

type Point = { x: number; y: number };

export default function CallWhiteboard({
  callId,
  visible,
  onClose,
}: {
  callId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const boardSize = useRef({ width: 1, height: 1 });
  const currentStroke = useRef<Stroke | null>(null);

  useEffect(() => {
    if (!visible || Platform.OS === "web") return;
    setIsLandscape(false);

    let cancelled = false;
    let previousLock: ScreenOrientation.OrientationLock | undefined;
    const orientationSubscription =
      ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
        setIsLandscape(
          orientationInfo.orientation ===
            ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
            orientationInfo.orientation ===
              ScreenOrientation.Orientation.LANDSCAPE_RIGHT,
        );
      });

    void (async () => {
      try {
        previousLock = await ScreenOrientation.getOrientationLockAsync();
        if (!cancelled) {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP,
          );
        }
      } catch (error) {
        console.warn("Could not set whiteboard orientation:", error);
      }
    })();

    return () => {
      cancelled = true;
      orientationSubscription.remove();
      if (previousLock !== undefined) {
        void ScreenOrientation.lockAsync(previousLock).catch((error: unknown) => {
          console.warn("Could not restore screen orientation:", error);
        });
      }
    };
  }, [visible]);

  const toggleBoardOrientation = async () => {
    if (Platform.OS === "web") return;

    const nextOrientation = isLandscape
      ? ScreenOrientation.OrientationLock.PORTRAIT_UP
      : ScreenOrientation.OrientationLock.LANDSCAPE;

    try {
      await ScreenOrientation.lockAsync(nextOrientation);
      setIsLandscape(!isLandscape);
    } catch (error) {
      console.warn("Could not rotate whiteboard:", error);
    }
  };

  useEffect(() => {
    const unsubscribeStroke = onCallWhiteboardStroke((data) => {
      if (data.callId !== callId) return;
      setStrokes((current) =>
        current.some((stroke) => stroke.id === data.stroke.id)
          ? current
          : [...current, data.stroke],
      );
    });
    const unsubscribeClear = onCallWhiteboardCleared((data) => {
      if (data.callId !== callId) return;
      setStrokes([]);
      setDraft(null);
      currentStroke.current = null;
    });

    return () => {
      unsubscribeStroke?.();
      unsubscribeClear?.();
    };
  }, [callId]);

  const pointFromTouch = useCallback(
    (touch: NativeTouchEvent): Point => ({
      x: Math.min(1, Math.max(0, touch.locationX / boardSize.current.width)),
      y: Math.min(1, Math.max(0, touch.locationY / boardSize.current.height)),
    }),
    [],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const stroke: Stroke = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            color: STROKE_COLOR,
            points: [pointFromTouch(event.nativeEvent)],
          };
          currentStroke.current = stroke;
          setDraft(stroke);
        },
        onPanResponderMove: (event) => {
          const previous = currentStroke.current;
          if (!previous || previous.points.length >= 500) return;
          const point = pointFromTouch(event.nativeEvent);
          const last = previous.points[previous.points.length - 1];
          if (Math.abs(last.x - point.x) + Math.abs(last.y - point.y) < 0.003) {
            return;
          }
          const next = { ...previous, points: [...previous.points, point] };
          currentStroke.current = next;
          setDraft(next);
        },
        onPanResponderRelease: () => {
          const completed = currentStroke.current;
          currentStroke.current = null;
          setDraft(null);
          if (!completed) return;
          setStrokes((current) => [...current, completed]);
          void publishCallWhiteboardStroke({ callId, stroke: completed }).catch(
            (error: unknown) => {
              console.warn("Could not sync call whiteboard stroke:", error);
            },
          );
        },
        onPanResponderTerminate: () => {
          currentStroke.current = null;
          setDraft(null);
        },
      }),
    [callId, pointFromTouch],
  );

  const handleClear = async () => {
    setStrokes([]);
    setDraft(null);
    currentStroke.current = null;
    try {
      await clearCallWhiteboard({ callId });
    } catch (error) {
      console.warn("Could not sync call whiteboard clear:", error);
    }
  };

  const handleBoardLayout = (event: LayoutChangeEvent) => {
    boardSize.current = {
      width: Math.max(1, event.nativeEvent.layout.width),
      height: Math.max(1, event.nativeEvent.layout.height),
    };
  };

  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={[StyleSheet.absoluteFill, styles.overlay, !visible && styles.hidden]}
    >
      <View style={styles.toolbar}>
        <Text style={styles.title}>Call whiteboard</Text>
        {Platform.OS !== "web" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isLandscape
                ? "Switch to portrait board"
                : "Switch to landscape board"
            }
            onPress={() => void toggleBoardOrientation()}
            style={styles.toolbarButton}
          >
            <Feather name="rotate-cw" size={18} color="#17212B" />
            <Text style={styles.toolbarButtonLabel}>
              {isLandscape ? "Portrait" : "Landscape"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear whiteboard"
          onPress={() => void handleClear()}
          style={styles.toolbarButton}
        >
          <Feather name="trash-2" size={18} color="#17212B" />
          <Text style={styles.toolbarButtonLabel}>Clear</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close whiteboard"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Feather name="x" size={20} color="#fff" />
        </Pressable>
      </View>

      <View
        onLayout={handleBoardLayout}
        style={styles.board}
        {...panResponder.panHandlers}
      >
        {[...strokes, ...(draft ? [draft] : [])].map((stroke) => (
          <StrokeView
            key={stroke.id}
            stroke={stroke}
            boardSize={boardSize.current}
          />
        ))}
        {strokes.length === 0 && !draft ? (
          <Text pointerEvents="none" style={styles.hint}>
            Draw here to share with everyone in the call
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function StrokeView({
  stroke,
  boardSize,
}: {
  stroke: Stroke;
  boardSize: { width: number; height: number };
}) {
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    return (
      <View
        pointerEvents="none"
        style={[
          styles.dot,
          {
            backgroundColor: stroke.color,
            left: point.x * boardSize.width - 3,
            top: point.y * boardSize.height - 3,
          },
        ]}
      />
    );
  }

  return (
    <>
      {stroke.points.slice(1).map((point, index) => {
        const previous = stroke.points[index];
        const x1 = previous.x * boardSize.width;
        const y1 = previous.y * boardSize.height;
        const x2 = point.x * boardSize.width;
        const y2 = point.y * boardSize.height;
        const width = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        return (
          <View
            key={`${stroke.id}-${index}`}
            pointerEvents="none"
            style={[
              styles.line,
              {
                backgroundColor: stroke.color,
                left: (x1 + x2 - width) / 2,
                top: (y1 + y2) / 2 - 2,
                transform: [{ rotate: `${angle}rad` }],
                width,
              },
            ]}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(5, 10, 12, 0.92)",
    paddingTop: 52,
    paddingBottom: 24,
    paddingHorizontal: 14,
  },
  hidden: {
    display: "none",
  },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  title: {
    color: "#fff",
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
  },
  toolbarButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  toolbarButtonLabel: {
    color: "#17212B",
    fontSize: 13,
    fontWeight: "600",
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "#38444B",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  board: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    flex: 1,
    overflow: "hidden",
  },
  hint: {
    color: "#61717C",
    fontSize: 14,
    left: 16,
    position: "absolute",
    top: 16,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    position: "absolute",
    width: 6,
  },
  line: {
    height: 4,
    position: "absolute",
  },
});
