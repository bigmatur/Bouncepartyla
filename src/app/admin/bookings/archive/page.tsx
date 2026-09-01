import { redirect } from "next/navigation";

export default function AdminBookingsArchivePage() {
  redirect("/admin/bookings?view=archived");
}
