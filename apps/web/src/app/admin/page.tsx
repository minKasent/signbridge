import type { Metadata } from "next";
import AdminStudio from "./AdminStudio";

export const metadata: Metadata = {
  title: "Quản trị từ điển",
};

export default function AdminPage() {
  return <AdminStudio />;
}
