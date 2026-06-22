import { Badge } from "@/components/ui/badge";

type AuthFeedbackProps = {
  error?: string;
  success?: string;
};

export function AuthFeedback({ error, success }: AuthFeedbackProps) {
  if (!error && !success) {
    return null;
  }

  if (error) {
    return <Badge variant="danger">{error}</Badge>;
  }

  return <Badge variant="success">{success}</Badge>;
}
