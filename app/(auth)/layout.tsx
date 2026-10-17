import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          DuMeGud
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-16 pt-6 sm:px-6">{children}</main>
    </div>
  );
}
