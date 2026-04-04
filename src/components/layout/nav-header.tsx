"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Upload" },
  { href: "/leads", label: "Leads" },
];

export function NavHeader() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <header className="border-b bg-background">
      <nav className="flex items-center gap-6 px-6 h-14">
        <span className="font-semibold text-sm tracking-tight mr-4">
          Lead Management
        </span>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm transition-colors hover:text-foreground",
                isActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
