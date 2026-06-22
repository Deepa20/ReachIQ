import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ModuleSummaryCardProps = {
  title: string;
  description: string;
  href: string;
};

export function ModuleSummaryCard({ title, description, href }: ModuleSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter>
        <Link href={href} className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
          Open module
        </Link>
      </CardFooter>
    </Card>
  );
}
