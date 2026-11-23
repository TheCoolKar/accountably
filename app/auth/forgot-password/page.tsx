import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/app/forgot-password-form";

export const metadata: Metadata = { title: "Reset password · Accountably" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
