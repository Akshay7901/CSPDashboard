import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/proofreader/proposal/$ticket")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/proofreader_proposal/$ticket",
      params: { ticket: params.ticket },
    });
  },
  component: () => null,
});