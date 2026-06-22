import Link from "next/link";

import { AuthFeedback } from "@/components/auth/auth-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { resetPasswordAction } from "../actions";

type ResetPasswordPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const success = typeof params.success === "string" ? params.success : undefined;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>We&apos;ll send a secure reset link to your inbox.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthFeedback error={error} success={success} />
        <form action={resetPasswordAction} className="space-y-3">
          <Input name="email" type="email" placeholder="Work email" required />
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </form>
        <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
          Back to login
        </Link>
      </CardContent>
    </Card>
  );
}
