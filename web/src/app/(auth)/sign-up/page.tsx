import Link from "next/link";

import { AuthFeedback } from "@/components/auth/auth-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { signUpAction } from "../actions";

type SignUpPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const success = typeof params.success === "string" ? params.success : undefined;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Create your ReachIQ account</CardTitle>
        <CardDescription>Set up your tenant and start validating outreach data.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthFeedback error={error} success={success} />
        <form action={signUpAction} className="space-y-3">
          <Input name="fullName" placeholder="Full name" required />
          <Input name="organizationName" placeholder="Organization name" required />
          <Input name="email" type="email" placeholder="Work email" required />
          <Input name="password" type="password" placeholder="Password" minLength={8} required />
          <Button type="submit" className="w-full">
            Sign up
          </Button>
        </form>
        <p className="text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="text-slate-900 underline underline-offset-4">
            Login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
