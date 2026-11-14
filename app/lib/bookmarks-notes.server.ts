import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";

// Bookmarks and Notes: what a Student attaches to a Lesson, for themselves.
// See GLOSSARY.md. A Note is private to the Student who wrote it, so nothing
// here reads Note bodies for anyone but their owner.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;

export const MAX_NOTE_LENGTH = 2000;

export type SaveNoteResult =
  | { ok: true; note: typeof notes.$inferSelect }
  | { ok: false; error: string };

export function isBookmarked(db: Db, userId: number, lessonId: number) {
  return !!db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .get();
}

// Adds the Bookmark if the Student has none on the Lesson, removes it if they
// do. Returns whether the Lesson is bookmarked afterwards. The unique index
// settles a race between two requests.
export function toggleBookmark(db: Db, userId: number, lessonId: number) {
  const inserted = db
    .insert(bookmarks)
    .values({ userId, lessonId })
    .onConflictDoNothing()
    .run();

  if (inserted.changes > 0) return true;

  db.delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .run();
  return false;
}

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

// Creates the Student's Note on the Lesson, or replaces the body of the one
// they already have and moves "last edited" on.
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "Enter a note before saving." };
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      error: `Notes can be at most ${MAX_NOTE_LENGTH} characters.`,
    };
  }

  const stamp = now.toISOString();
  const note = db
    .insert(notes)
    .values({
      userId,
      lessonId,
      body: trimmed,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: trimmed, updatedAt: stamp },
    })
    .returning()
    .get();

  return { ok: true, note };
}

// Removes the Student's Note on the Lesson for good. Returns whether there was
// one to remove.
export function deleteNote(db: Db, userId: number, lessonId: number) {
  const result = db
    .delete(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .run();
  return result.changes > 0;
}

const lessonCourseColumns = {
  lessonId: lessons.id,
  lessonTitle: lessons.title,
  moduleTitle: modules.title,
  courseTitle: courses.title,
  courseSlug: courses.slug,
};

// The Student's Bookmarks, newest first, each with the Lesson and Course it
// belongs to.
export function listBookmarks(db: Db, userId: number) {
  return db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      ...lessonCourseColumns,
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(bookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt))
    .all();
}

// The Student's Notes, most recently edited first, each with the Lesson and
// Course it belongs to.
export function listNotes(db: Db, userId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      ...lessonCourseColumns,
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .all();
}
