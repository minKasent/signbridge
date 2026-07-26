import type { Metadata } from "next";
import VideoTranslateTool from "./VideoTranslateTool";

export const metadata: Metadata = {
  title: "Dịch từ video",
};

export default function VideoPage() {
  return <VideoTranslateTool />;
}
