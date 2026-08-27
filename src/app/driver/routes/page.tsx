import { redirect } from "next/navigation";

import {
	requireDriverInterfaceAccess,
	resolveDriverRecordForView,
} from "@/lib/auth/require-driver";
import { isStaffRole } from "@/lib/auth/access";

function todayISO() {
	const date = new Date();
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export default async function DriverRouteBoardProxyPage(props: {
	searchParams?: Promise<{ date?: string; status?: string; type?: string; q?: string; driver?: string }>;
}) {
	const searchParams = props.searchParams ? await props.searchParams : {};
	const date = String(searchParams.date || todayISO());
	const selectedDriver = String(searchParams.driver || "").trim();

	const { supabase, access, linkedDriverRecord } = await requireDriverInterfaceAccess();

	if (!isStaffRole(access.role) && access.role !== "driver") {
		const fallbackQuery = new URLSearchParams();
		fallbackQuery.set("date", date);
		fallbackQuery.set("limited", "1");
		redirect(`/driver?${fallbackQuery.toString()}`);
	}

	const { driverRecord } = await resolveDriverRecordForView({
		supabase,
		access,
		linkedDriverRecord,
		requestedDriverName: selectedDriver,
	});

	const query = new URLSearchParams();
	query.set("date", date);
	query.set("driver", String(driverRecord.name || "").trim());

	redirect(`/admin/routes/driver?${query.toString()}`);
}
