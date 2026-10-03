import { SignUp } from "@clerk/nextjs";
import { AuthCardSkeleton, AuthFrame } from "@/components/auth-frame";

// Nothing here depends on who is asking, so it is built once instead of on every visit.
export function generateStaticParams() {
  return [{ "sign-up": [] }];
}

export default function Page() {
  return (
    <AuthFrame>
      <SignUp fallback={<AuthCardSkeleton />} />
    </AuthFrame>
  );
}
