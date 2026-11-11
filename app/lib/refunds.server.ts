import { data } from "react-router";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  coupons,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  RefundStatus,
  refunds,
  users,
  videoWatchEvents,
} from "~/db/schema";
import { formatPrice } from "~/lib/utils";

export type Database = BetterSQLite3Database<typeof schema>;

/**
 * What a Refund gives back: what the learner actually paid, after any
 * purchasing-power discount or coupon. Never the course's list price.
 * See docs/adr/0002-refund-amount-is-amount-paid.md.
 */
export function getRefundAmount(purchase: { amountPaid: number }): number {
  return purchase.amountPaid;
}

export type RefundDecision = "approve" | "decline";

export type DecidedRefund = {
  decision: RefundDecision;
  amount: number;
  learner: { name: string; email: string };
  courseTitle: string;
};

/**
 * Settles one Pending Refund Request. Approving ends the learner's Course
 * Access straight away and voids unclaimed team seats from the Purchase; their
 * Progress is kept. Declining only records the decision.
 * See docs/adr/0001-revoke-course-access-on-approval.md.
 *
 * Everything runs in one transaction, so a request is never half decided.
 */
export function decideRefund(
  database: Database,
  input: { refundId: number; adminId: number; decision: RefundDecision }
): DecidedRefund {
  return database.transaction((tx) => {
    const refund = tx
      .select()
      .from(refunds)
      .where(eq(refunds.id, input.refundId))
      .get();

    if (!refund) {
      throw data("Refund request not found.", { status: 404 });
    }

    if (refund.status !== RefundStatus.Requested) {
      throw data("This refund request has already been decided.", {
        status: 409,
      });
    }

    const purchase = tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, refund.purchaseId))
      .get();

    if (!purchase) {
      throw data("Purchase not found.", { status: 404 });
    }

    if (purchase.userId === input.adminId) {
      throw data("You cannot decide a refund request on your own purchase.", {
        status: 403,
      });
    }

    const learner = tx
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, purchase.userId))
      .get();

    const course = tx
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, purchase.courseId))
      .get();

    if (!learner || !course) {
      throw data("Learner or course not found.", { status: 404 });
    }

    const approving = input.decision === "approve";
    const amount = getRefundAmount(purchase);

    // The status check in the WHERE clause makes this safe against two Admins
    // deciding at once. Only the first update matches.
    const updated = tx
      .update(refunds)
      .set({
        status: approving ? RefundStatus.Approved : RefundStatus.Declined,
        amountRefunded: approving ? amount : null,
        resolvedAt: new Date().toISOString(),
        resolvedByUserId: input.adminId,
      })
      .where(
        and(
          eq(refunds.id, refund.id),
          eq(refunds.status, RefundStatus.Requested)
        )
      )
      .returning({ id: refunds.id })
      .get();

    if (!updated) {
      throw data("This refund request has already been decided.", {
        status: 409,
      });
    }

    if (approving) {
      tx.delete(enrollments)
        .where(
          and(
            eq(enrollments.userId, purchase.userId),
            eq(enrollments.courseId, purchase.courseId)
          )
        )
        .run();

      tx.delete(coupons)
        .where(
          and(eq(coupons.purchaseId, purchase.id), isNull(coupons.redeemedAt))
        )
        .run();
    }

    return {
      decision: input.decision,
      amount,
      learner,
      courseTitle: course.title,
    };
  });
}

export type PendingRefundRequest = {
  id: number;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  courseSlug: string;
  reason: string;
  requestedAt: string;
  amount: number;
  completedLessons: number;
  totalLessons: number;
  hoursWatched: number;
};

/** Pending Refund Requests, oldest first, with how far each learner got. */
export function getPendingRefundRequests(
  database: Database
): PendingRefundRequest[] {
  const rows = database
    .select({
      id: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      amountPaid: purchases.amountPaid,
      learnerId: users.id,
      learnerName: users.name,
      learnerEmail: users.email,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.status, RefundStatus.Requested))
    .orderBy(asc(refunds.requestedAt))
    .all();

  return rows.map((row) => {
    const lessonIds = database
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, row.courseId))
      .all()
      .map((lesson) => lesson.id);

    let completedLessons = 0;
    let secondsWatched = 0;

    if (lessonIds.length > 0) {
      completedLessons =
        database
          .select({ count: sql<number>`count(*)` })
          .from(lessonProgress)
          .where(
            and(
              eq(lessonProgress.userId, row.learnerId),
              eq(lessonProgress.status, LessonProgressStatus.Completed),
              inArray(lessonProgress.lessonId, lessonIds)
            )
          )
          .get()?.count ?? 0;

      secondsWatched = database
        .select({
          furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
        })
        .from(videoWatchEvents)
        .where(
          and(
            eq(videoWatchEvents.userId, row.learnerId),
            inArray(videoWatchEvents.lessonId, lessonIds)
          )
        )
        .groupBy(videoWatchEvents.lessonId)
        .all()
        .reduce((total, lesson) => total + lesson.furthest, 0);
    }

    return {
      id: row.id,
      learnerName: row.learnerName,
      learnerEmail: row.learnerEmail,
      courseTitle: row.courseTitle,
      courseSlug: row.courseSlug,
      reason: row.reason,
      requestedAt: row.requestedAt,
      amount: getRefundAmount({ amountPaid: row.amountPaid }),
      completedLessons,
      totalLessons: lessonIds.length,
      hoursWatched: Math.round((secondsWatched / 3600) * 10) / 10,
    };
  });
}

/**
 * The email the learner gets once their request is decided. There is no mail
 * transport yet, so the caller logs the built message.
 */
export function buildRefundDecisionEmail(input: DecidedRefund) {
  const { learner, courseTitle, amount } = input;

  if (input.decision === "approve") {
    return {
      to: learner.email,
      subject: `Refund approved — ${courseTitle}`,
      body: [
        `Hi ${learner.name},`,
        "",
        `We approved your refund request for "${courseTitle}".`,
        `The refund is for ${formatPrice(amount)}, the amount you paid.`,
        "",
        "Your access to the course has ended. Your progress is saved, so it will be waiting if you buy the course again.",
        "",
        "— The Cadence team",
      ].join("\n"),
    };
  }

  return {
    to: learner.email,
    subject: `Refund request declined — ${courseTitle}`,
    body: [
      `Hi ${learner.name},`,
      "",
      `We reviewed your refund request for "${courseTitle}" and could not approve it.`,
      "You keep full access to the course and nothing has been refunded.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}
