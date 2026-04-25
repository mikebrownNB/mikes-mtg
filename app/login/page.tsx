import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · mikes-mtg" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">mikes-mtg</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Sign in to access your collection.
        </p>
      </div>
      <LoginForm next={next} />
      {error === "auth_failed" && (
        <p className="text-center text-sm text-red-400">
          That sign-in link didn&apos;t work. Try requesting a new one.
        </p>
      )}
    </main>
  );
}
