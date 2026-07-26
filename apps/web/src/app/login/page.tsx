import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Đăng nhập | SignBridge",
};

export default function LoginPage() {
  return <LoginForm />;
}
