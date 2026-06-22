import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

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
        <Button asChild variant="secondary" className="w-full">
          <Link href={href}>Open module</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
