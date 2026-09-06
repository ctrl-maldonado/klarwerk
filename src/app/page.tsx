import { redirect } from "next/navigation";
import { getAuthContext } from "@/modules/auth/context";

export default async function HomePage() {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  redirect(context.tenant.onboardingCompleted ? "/dashboard" : "/onboarding");
}
