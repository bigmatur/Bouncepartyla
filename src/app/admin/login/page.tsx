import { redirect } from "next/navigation";

export default async function AdminLoginRedirectPage() {
  redirect("/login?next=/admin");
}
