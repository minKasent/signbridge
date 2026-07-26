import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

/**
 * Pipeline trích đặc trưng dùng chung cho trang dịch (/translate) và thu mẫu (/collect).
 * Vector 144 chiều: [tay trái 21×3 | tay phải 21×3 | vai-khuỷu-cổ tay 6×3].
 * QUAN TRỌNG: training/preprocess phải dùng ĐÚNG cấu trúc này (xem training/README.md).
 */

export const FRAME_DIMS = 144;
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
export const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws/translate";

// Điểm pose thân trên: vai, khuỷu tay, cổ tay (trái + phải)
const UPPER_BODY_POSE = [11, 12, 13, 14, 15, 16];

export interface Landmarkers {
  hand: HandLandmarker;
  pose: PoseLandmarker;
  close: () => void;
}

export async function createLandmarkers(): Promise<Landmarkers> {
  const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const create = async (delegate: "GPU" | "CPU") => {
    const hand = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate },
      runningMode: "VIDEO",
      numHands: 2,
    });
    try {
      const pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      return { hand, pose, close: () => (hand.close(), pose.close()) };
    } catch (e) {
      // Máy có thể tạo được hand GPU nhưng pose GPU lỗi — không đóng thì rò
      // WebGL context (browser giới hạn ~16 context, hết là hỏng canvas).
      hand.close();
      throw e;
    }
  };
  try {
    return await create("GPU");
  } catch {
    return await create("CPU");
  }
}

/** Làm tròn 4 chữ số — giảm ~3 lần payload, dư chính xác cho model. */
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export function buildFrame(
  hands: HandLandmarkerResult,
  pose: PoseLandmarkerResult
): number[] {
  const frame = new Array<number>(FRAME_DIMS).fill(0);
  hands.landmarks.forEach((landmarks, i) => {
    const isLeft = hands.handednesses[i]?.[0]?.categoryName === "Left";
    const offset = isLeft ? 0 : 63;
    landmarks.forEach((p, j) => {
      frame[offset + j * 3] = r4(p.x);
      frame[offset + j * 3 + 1] = r4(p.y);
      frame[offset + j * 3 + 2] = r4(p.z);
    });
  });
  const poseLm = pose.landmarks[0];
  if (poseLm) {
    UPPER_BODY_POSE.forEach((idx, j) => {
      frame[126 + j * 3] = r4(poseLm[idx].x);
      frame[126 + j * 3 + 1] = r4(poseLm[idx].y);
      frame[126 + j * 3 + 2] = r4(poseLm[idx].z);
    });
  }
  return frame;
}

/** Frame có tay trong khung hình không (63 số đầu hoặc 63 số sau khác 0)? */
export function hasHand(frame: number[]): boolean {
  for (let i = 0; i < 126; i++) if (frame[i] !== 0) return true;
  return false;
}
