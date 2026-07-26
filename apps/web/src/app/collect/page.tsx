import type { Metadata } from "next";
import CollectTool from "./CollectTool";

export const metadata: Metadata = {
  title: "Thu thập dữ liệu | SignBridge",
};

export default function CollectPage() {
  return <CollectTool />;
}
