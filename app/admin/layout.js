export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-[100dvh] bg-neutral-100 flex justify-center">
      <main className="w-full min-h-[100dvh] bg-white md:max-w-[1100px] md:shadow md:border">
        {children}
      </main>
    </div>
  );
}
