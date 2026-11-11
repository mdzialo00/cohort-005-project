import { useEffect } from "react";
import { data, isRouteErrorResponse, Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, Undo2 } from "lucide-react";
import type { Route } from "./+types/admin.refunds";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { db } from "~/db";
import { UserRole, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  buildRefundDecisionEmail,
  decideRefund,
  getPendingRefundRequests,
} from "~/lib/refunds.server";
import { formatPrice } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

const decisionSchema = z.object({
  intent: z.enum(["approve", "decline"]),
  refundId: z.coerce.number().int(),
});

async function requireAdmin(request: Request, message: string) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to manage refunds.", {
      status: 401,
    });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data(message, { status: 403 });
  }

  return currentUser;
}

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Decide pending refund requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request, "Only admins can access this page.");

  return { refundRequests: getPendingRefundRequests(db) };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request, "Only admins can decide refunds.");

  const formData = await request.formData();
  const parsed = parseFormData(formData, decisionSchema);

  if (!parsed.success) {
    throw data("Invalid input.", { status: 400 });
  }

  const decided = decideRefund(db, {
    refundId: parsed.data.refundId,
    adminId: admin.id,
    decision: parsed.data.intent,
  });

  const email = buildRefundDecisionEmail(decided);
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);

  return { decision: decided.decision, learnerName: decided.learner.name };
}

function RefundRequestCard({
  refundRequest,
}: {
  refundRequest: Route.ComponentProps["loaderData"]["refundRequests"][number];
}) {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      toast.success(
        fetcher.data.decision === "approve"
          ? `Approved. ${fetcher.data.learnerName} no longer has access.`
          : `Declined. ${fetcher.data.learnerName} keeps access.`
      );
    }
  }, [fetcher.state, fetcher.data]);

  function decide(intent: "approve" | "decline") {
    if (
      intent === "approve" &&
      !window.confirm(
        `Approve a ${formatPrice(refundRequest.amount)} refund for ${refundRequest.learnerName}? They lose access to the course right away.`
      )
    ) {
      return;
    }

    fetcher.submit(
      { intent, refundId: String(refundRequest.id) },
      { method: "post" }
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{refundRequest.learnerName}</p>
            <p className="text-sm text-muted-foreground">
              {refundRequest.learnerEmail}
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            Pending
          </span>
        </div>

        <p className="text-sm">
          <Link
            to={`/courses/${refundRequest.courseSlug}`}
            className="font-medium hover:underline"
          >
            {refundRequest.courseTitle}
          </Link>
          <span className="text-muted-foreground">
            {" "}
            · {formatPrice(refundRequest.amount)} · requested{" "}
            {new Date(refundRequest.requestedAt).toLocaleDateString()}
          </span>
        </p>

        <p className="text-sm text-muted-foreground">
          {refundRequest.completedLessons} of {refundRequest.totalLessons}{" "}
          lessons completed · {refundRequest.hoursWatched} hours watched
        </p>

        <p className="rounded-md bg-muted/50 p-3 text-sm">
          {refundRequest.reason}
        </p>

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={() => decide("approve")}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => decide("decline")}
          >
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { refundRequests } = loaderData;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Approving a request ends the learner&apos;s access to the course.
          Their progress is kept.
        </p>
      </div>

      {refundRequests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Undo2 className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No pending refund requests.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {refundRequests.map((refundRequest) => (
            <RefundRequestCard
              key={refundRequest.id}
              refundRequest={refundRequest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading refund requests.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 403 ? "Access denied" : `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
