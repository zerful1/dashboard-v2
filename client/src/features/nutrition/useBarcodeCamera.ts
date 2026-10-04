import { useEffect, useRef, useState, type RefObject } from "react";
import { createDetector } from "./barcodeDetector";

export type CameraState = "starting" | "scanning" | "denied" | "unavailable";
const SCAN_EVERY_MS = 250;

/**
 * The back camera into `video`, read every 250 ms until a code turns up. The
 * stream stops the moment a code is read or the caller unmounts: the camera
 * light must never stay on (spec §3).
 */
export function useBarcodeCamera(video: RefObject<HTMLVideoElement | null>, onCode: (code: string) => void): CameraState {
  const [state, setState] = useState<CameraState>("starting");
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (err) {
        if (!stopped) setState(err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "unavailable");
        return;
      }
      // Unmounted while the permission prompt was up: release the camera at once.
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const el = video.current;
      if (!el) {
        stop();
        return;
      }
      el.srcObject = stream;
      await Promise.resolve(el.play()).catch(() => {});
      let detector;
      try {
        detector = await createDetector();
      } catch {
        stop();
        setState("unavailable");
        return;
      }
      if (stopped) return;
      setState("scanning");
      let busy = false;
      timer = setInterval(async () => {
        if (busy || stopped || el.readyState < 2) return;
        busy = true;
        try {
          const found = (await detector.detect(el)).find((b) => /^\d{8,14}$/.test(b.rawValue));
          if (found && !stopped) {
            stop();
            onCodeRef.current(found.rawValue);
          }
        } catch {
          // A frame that can't be read; the next one may.
        } finally {
          busy = false;
        }
      }, SCAN_EVERY_MS);
    })();

    return stop;
  }, [video]);

  return state;
}
