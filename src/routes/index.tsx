import { createFileRoute } from "@tanstack/react-router";
import FuelApp from "@/components/fuel/FuelApp";
import { Toaster } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "THE FUEL — Nutritional Protocol" },
      { name: "description", content: "Premium dark editorial food tracking. Log fuel, monitor discipline, master your circadian intake." },
    ],
  }),
});

function Index() {
  return (
    <>
      <FuelApp />
      <Toaster position="top-center" theme="dark" />
    </>
  );
}
