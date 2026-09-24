import type { ReactNode } from "react";

export default function CatalogLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="admin-ipad-page admin-ipad-catalog">{children}</div>;
}
