import type { ReactNode } from "react";

export default function BusinessIntelligenceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="admin-ipad-page admin-ipad-bi">{children}</div>;
}
