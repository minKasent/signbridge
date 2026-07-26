import type { Metadata } from "next";
import VideoTranslateLoader from "./VideoTranslateLoader";

export const metadata: Metadata = {
  title: "Dịch từ video",
};

export default function VideoPage() {
  return <VideoTranslateLoader />;
}
