import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  buildRefundDecisionEmail,
  decideRefund,
  getPendingRefundRequests,
  getRefundAmount,
  type Database as AppDatabase,
} from "./refunds.server";

let database: AppDatabase;

function seed() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  database = drizzle(sqlite, { schema });
  migrate(database, { migrationsFolder: "drizzle" });

  const [admin, learner, otherAdmin] = database
    .insert(schema.users)
    .values([
      { name: "Ada Admin", email: "ada@example.com", role: schema.UserRole.Admin },
      { name: "Lena Learner", email: "lena@example.com", role: schema.UserRole.Student },
      { name: "Olga Admin", email: "olga@example.com", role: schema.UserRole.Admin },
    ])
    .returning()
    .all();

  const category = database
    .insert(schema.categories)
    .values({ name: "Dev", slug: "dev" })
    .returning()
    .get();

  const course = database
    .insert(schema.courses)
    .values({
      title: "TypeScript",
      slug: "typescript",
      description: "d",
      salesCopy: "s",
      instructorId: admin.id,
      categoryId: category.id,
      status: schema.CourseStatus.Published,
      price: 10000,
    })
    .returning()
    .get();

  const module = database
    .insert(schema.modules)
    .values({ courseId: course.id, title: "m", position: 1 })
    .returning()
    .get();

  const [lessonA, lessonB] = database
    .insert(schema.lessons)
    .values([
      { moduleId: module.id, title: "a", position: 1 },
      { moduleId: module.id, title: "b", position: 2 },
    ])
    .returning()
    .all();

  // Paid $60 against a list price of $100, so the two amounts differ.
  const purchase = database
    .insert(schema.purchases)
    .values({ userId: learner.id, courseId: course.id, amountPaid: 6000 })
    .returning()
    .get();

  database
    .insert(schema.enrollments)
    .values({ userId: learner.id, courseId: course.id })
    .run();

  database
    .insert(schema.lessonProgress)
    .values({
      userId: learner.id,
      lessonId: lessonA.id,
      status: schema.LessonProgressStatus.Completed,
    })
    .run();

  database
    .insert(schema.videoWatchEvents)
    .values({ userId: learner.id, lessonId: lessonA.id, eventType: "progress", positionSeconds: 1800 })
    .run();

  const refund = database
    .insert(schema.refunds)
    .values({
      purchaseId: purchase.id,
      reason: "Not what I expected from the course.",
    })
    .returning()
    .get();

  const team = database.insert(schema.teams).values({}).returning().get();
  database
    .insert(schema.coupons)
    .values([
      {
        teamId: team.id,
        courseId: course.id,
        code: "UNCLAIMED",
        purchaseId: purchase.id,
      },
      {
        teamId: team.id,
        courseId: course.id,
        code: "CLAIMED",
        purchaseId: purchase.id,
        redeemedByUserId: otherAdmin.id,
        redeemedAt: new Date().toISOString(),
      },
    ])
    .run();

  return { admin, learner, otherAdmin, course, purchase, refund, lessonB };
}

async function thrownStatus(run: () => unknown): Promise<number | undefined> {
  try {
    run();
  } catch (error) {
    return (error as { init?: { status?: number } }).init?.status;
  }
  return undefined;
}

describe("refunds", () => {
  let ctx: ReturnType<typeof seed>;

  beforeEach(() => {
    ctx = seed();
  });

  describe("getRefundAmount", () => {
    it("is what the learner paid", () => {
      expect(getRefundAmount({ amountPaid: 6000 })).toBe(6000);
    });
  });

  describe("decideRefund approving", () => {
    it("marks the request Approved with the amount paid and who decided", () => {
      decideRefund(database, {
        refundId: ctx.refund.id,
        adminId: ctx.admin.id,
        decision: "approve",
      });

      const refund = database
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.id, ctx.refund.id))
        .get();

      expect(refund?.status).toBe(schema.RefundStatus.Approved);
      expect(refund?.amountRefunded).toBe(6000);
      expect(refund?.resolvedByUserId).toBe(ctx.admin.id);
      expect(refund?.resolvedAt).not.toBeNull();
    });

    it("ends the learner's access to the course", () => {
      decideRefund(database, {
        refundId: ctx.refund.id,
        adminId: ctx.admin.id,
        decision: "approve",
      });

      const enrollment = database
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.userId, ctx.learner.id),
            eq(schema.enrollments.courseId, ctx.course.id)
          )
        )
        .get();

      expect(enrollment).toBeUndefined();
    });

    it("keeps the learner's progress", () => {
      decideRefund(database, {
        refundId: ctx.refund.id,
        adminId: ctx.admin.id,
        decision: "approve",
      });

      expect(database.select().from(schema.lessonProgress).all()).toHaveLength(1);
      expect(database.select().from(schema.videoWatchEvents).all()).toHaveLength(1);
    });

    it("voids unclaimed team seats and leaves claimed ones", () => {
      decideRefund(database, {
        refundId: ctx.refund.id,
        adminId: ctx.admin.id,
        decision: "approve",
      });

      const codes = database
        .select({ code: schema.coupons.code })
        .from(schema.coupons)
        .all()
        .map((row) => row.code);

      expect(codes).toEqual(["CLAIMED"]);
    });
  });

  describe("decideRefund declining", () => {
    it("marks the request Declined and changes nothing else", () => {
      decideRefund(database, {
        refundId: ctx.refund.id,
        adminId: ctx.admin.id,
        decision: "decline",
      });

      const refund = database
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.id, ctx.refund.id))
        .get();

      expect(refund?.status).toBe(schema.RefundStatus.Declined);
      expect(refund?.amountRefunded).toBeNull();
      expect(database.select().from(schema.enrollments).all()).toHaveLength(1);
      expect(database.select().from(schema.coupons).all()).toHaveLength(2);
    });
  });

  describe("decideRefund guards", () => {
    it("rejects a second decision with 409", async () => {
      decideRefund(database, {
        refundId: ctx.refund.id,
        adminId: ctx.admin.id,
        decision: "decline",
      });

      const status = await thrownStatus(() =>
        decideRefund(database, {
          refundId: ctx.refund.id,
          adminId: ctx.otherAdmin.id,
          decision: "approve",
        })
      );

      expect(status).toBe(409);
      expect(database.select().from(schema.enrollments).all()).toHaveLength(1);
    });

    it("rejects an admin deciding their own purchase with 403", async () => {
      const adminPurchase = database
        .insert(schema.purchases)
        .values({ userId: ctx.admin.id, courseId: ctx.course.id, amountPaid: 10000 })
        .returning()
        .get();
      const ownRefund = database
        .insert(schema.refunds)
        .values({ purchaseId: adminPurchase.id, reason: "Changed my mind." })
        .returning()
        .get();

      const status = await thrownStatus(() =>
        decideRefund(database, {
          refundId: ownRefund.id,
          adminId: ctx.admin.id,
          decision: "approve",
        })
      );

      expect(status).toBe(403);
    });

    it("rejects an unknown request with 404", async () => {
      const status = await thrownStatus(() =>
        decideRefund(database, {
          refundId: 9999,
          adminId: ctx.admin.id,
          decision: "approve",
        })
      );

      expect(status).toBe(404);
    });
  });

  describe("getPendingRefundRequests", () => {
    it("lists pending requests with progress and the amount paid", () => {
      const [request] = getPendingRefundRequests(database);

      expect(request).toMatchObject({
        id: ctx.refund.id,
        learnerName: "Lena Learner",
        courseTitle: "TypeScript",
        amount: 6000,
        completedLessons: 1,
        totalLessons: 2,
        hoursWatched: 0.5,
      });
    });

    it("drops requests once they are decided", () => {
      decideRefund(database, {
        refundId: ctx.refund.id,
        adminId: ctx.admin.id,
        decision: "decline",
      });

      expect(getPendingRefundRequests(database)).toEqual([]);
    });
  });

  describe("buildRefundDecisionEmail", () => {
    const base = {
      amount: 6000,
      learner: { name: "Lena", email: "lena@example.com" },
      courseTitle: "TypeScript",
    };

    it("tells an approved learner the amount and that access ended", () => {
      const email = buildRefundDecisionEmail({ ...base, decision: "approve" });

      expect(email.to).toBe("lena@example.com");
      expect(email.subject).toContain("approved");
      expect(email.body).toContain("$60.00");
      expect(email.body).toContain("access to the course has ended");
    });

    it("tells a declined learner they keep access", () => {
      const email = buildRefundDecisionEmail({ ...base, decision: "decline" });

      expect(email.subject).toContain("declined");
      expect(email.body).toContain("keep full access");
    });
  });
});
