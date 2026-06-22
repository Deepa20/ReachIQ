import Link from "next/link";

import { AuthFeedback } from "@/components/auth/auth-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { signInAction } from "../actions";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const success = typeof params.success === "string" ? params.success : undefined;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Log in to ReachIQ</CardTitle>
        <CardDescription>Access your tenant workspace and outreach modules.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthFeedback error={error} success={success} />
        <form action={signInAction} className="space-y-3">
          <Input name="email" type="email" placeholder="Email" required />
          <Input name="password" type="password" placeholder="Password" required />
          <Button type="submit" className="w-full">
            Login
          </Button>
        </form>
        <div className="flex justify-between text-sm">
          <Link href="/reset-password" className="text-slate-600 hover:text-slate-900">
            Forgot password?
          </Link>
          <Link href="/sign-up" className="text-slate-600 hover:text-slate-900">
            Create account
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
