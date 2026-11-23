import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/app/reset-password-form";

export const metadata: Metadata = { title: "New password · Accountably" };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
