import Link from "next/link";
import { ScanFlow } from "@/components/scan-flow";

export const metadata = { title: "Scan · mikes-mtg" };
export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Scan a card</h1>
        <Link
          href="/"
          className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
        >
          Back
        </Link>
      </header>

      <p className="text-sm text-neutral-400">
        Snap the card with the title clearly visible. The image is resized in
        the browser before upload — no need for a perfect photo.
      </p>

      <ScanFlow />
    </main>
  );
}
