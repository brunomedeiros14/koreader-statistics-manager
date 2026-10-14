import { createRootRoute, Outlet } from "@tanstack/react-router";

import { Sidebar } from "../components/Sidebar";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-desk font-sans text-tinta antialiased md:grid md:grid-cols-[210px_1fr]">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col md:block md:px-8 md:py-8">
        <div className="flex-1 bg-papel px-4 py-6 md:min-h-[calc(100vh-4rem)] md:rounded-xl md:border md:border-linha md:px-10 md:py-9 md:shadow-[0_14px_40px_rgb(60_49_33/0.12)] lg:mx-auto lg:max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
