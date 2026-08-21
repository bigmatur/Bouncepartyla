import { redirect } from "next/navigation";

type SearchParams = Promise<{
  next?: string;
}>;

export const dynamic = "force-dynamic";

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const nextPath =
    params.next?.startsWith("/account") &&
    !params.next.startsWith("//")
      ? params.next
      : "/account";

  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}