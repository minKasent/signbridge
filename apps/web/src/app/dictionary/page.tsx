import type { Metadata } from "next";
import DictionaryBrowser from "./DictionaryBrowser";

export const metadata: Metadata = {
  title: "Từ điển ký hiệu | SignBridge",
};

export default function DictionaryPage() {
  return <DictionaryBrowser />;
}
