import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/proofreader/queue")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/proofreader" });
  },
  component: () => null,
});