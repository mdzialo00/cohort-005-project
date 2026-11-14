import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  deleteNote,
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  MAX_NOTE_LENGTH,
  saveNote,
  toggleBookmark,
} from "./bookmarks-notes.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesLater(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let otherStudent: typeof schema.users.$inferSelect;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  otherStudent = db
    .insert(schema.users)
    .values({
      name: "Other Student",
      email: "other@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get();

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

describe("toggling a bookmark", () => {
  it("bookmarks a lesson, then removes the bookmark on the second press", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("keeps one student's bookmark out of another student's view", () => {
    toggleBookmark(db, base.user.id, lessonIds[0]);

    expect(isBookmarked(db, otherStudent.id, lessonIds[0])).toBe(false);
  });
});

describe("saving a note", () => {
  it("creates a note with the body trimmed", () => {
    const result = saveNote(db, base.user.id, lessonIds[0], "  hello  ", NOW);

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("hello");
  });

  it("replaces the body on a second save and moves last edited on", () => {
    saveNote(db, base.user.id, lessonIds[0], "first", NOW);
    saveNote(db, base.user.id, lessonIds[0], "second", minutesLater(5));

    const note = getNote(db, base.user.id, lessonIds[0]);
    expect(note?.body).toBe("second");
    expect(note?.createdAt).toBe(NOW.toISOString());
    expect(note?.updatedAt).toBe(minutesLater(5).toISOString());
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("accepts a note of exactly the maximum length", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH),
      NOW
    );

    expect(result.ok).toBe(true);
  });

  it("refuses a note over the maximum length and stores nothing", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      NOW
    );

    expect(result.ok).toBe(false);
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("refuses an empty note", () => {
    const result = saveNote(db, base.user.id, lessonIds[0], "   ", NOW);

    expect(result.ok).toBe(false);
  });

  it("stores the text exactly as typed, with no markdown rendering", () => {
    saveNote(db, base.user.id, lessonIds[0], "# not a heading\n*plain*", NOW);

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(
      "# not a heading\n*plain*"
    );
  });
});

describe("deleting a note", () => {
  it("removes the note so the lesson has none", () => {
    saveNote(db, base.user.id, lessonIds[0], "gone soon", NOW);

    expect(deleteNote(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
    expect(listNotes(db, base.user.id)).toHaveLength(0);
  });

  it("leaves another student's note on the same lesson alone", () => {
    saveNote(db, base.user.id, lessonIds[0], "mine", NOW);
    saveNote(db, otherStudent.id, lessonIds[0], "theirs", NOW);

    deleteNote(db, base.user.id, lessonIds[0]);

    expect(getNote(db, otherStudent.id, lessonIds[0])?.body).toBe("theirs");
  });

  it("reports false when there was no note to delete", () => {
    expect(deleteNote(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("lets the student write a fresh note afterwards", () => {
    saveNote(db, base.user.id, lessonIds[0], "first", NOW);
    deleteNote(db, base.user.id, lessonIds[0]);
    saveNote(db, base.user.id, lessonIds[0], "second", minutesLater(5));

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("second");
  });
});

describe("the saved lists", () => {
  it("lists only the student's own bookmarks, newest first, with lesson and course", () => {
    db.insert(schema.bookmarks)
      .values([
        {
          userId: base.user.id,
          lessonId: lessonIds[0],
          createdAt: NOW.toISOString(),
        },
        {
          userId: base.user.id,
          lessonId: lessonIds[1],
          createdAt: minutesLater(5).toISOString(),
        },
        {
          userId: otherStudent.id,
          lessonId: lessonIds[0],
          createdAt: minutesLater(10).toISOString(),
        },
      ])
      .run();

    const rows = listBookmarks(db, base.user.id);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      lessonTitle: "Lesson 2",
      courseTitle: "Test Course",
      courseSlug: "test-course",
    });
  });

  it("lists only the student's own notes, most recently edited first", () => {
    saveNote(db, base.user.id, lessonIds[0], "older", NOW);
    saveNote(db, base.user.id, lessonIds[1], "newer", minutesLater(5));
    saveNote(db, otherStudent.id, lessonIds[0], "not mine", minutesLater(10));

    const rows = listNotes(db, base.user.id);

    expect(rows.map((row) => row.body)).toEqual(["newer", "older"]);
    expect(rows[0]).toMatchObject({
      lessonTitle: "Lesson 2",
      courseTitle: "Test Course",
    });
  });
});
