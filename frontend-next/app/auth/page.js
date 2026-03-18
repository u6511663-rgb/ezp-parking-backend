import { redirect } from "next/navigation";

export default function AuthPage() {
  redirect("/legacy/auth.html");
}

