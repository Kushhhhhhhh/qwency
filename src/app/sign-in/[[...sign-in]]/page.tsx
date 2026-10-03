import { SignIn } from "@clerk/nextjs";
import { AuthCardSkeleton, AuthFrame } from "@/components/auth-frame";

// Nothing here depends on who is asking, so it is built once instead of on every visit.
export function generateStaticParams() {
  return [{ "sign-in": [] }];
}

export default function Page() {
  return (
    <AuthFrame>
      <SignIn fallback={<AuthCardSkeleton />} />
    </AuthFrame>
  );
}
