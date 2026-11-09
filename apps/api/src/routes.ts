import { z } from "zod";
import {
  uuid,
  queryInput,
  answerSave,
  paper,
} from "../../../packages/contracts/src/index";
const text = z.string().min(1).max(20000),
  short = z.string().min(1).max(200),
  rev = z.number().int().positive();
export const operations = {
  "queries/archive": {
    rpc: "query_archive",
    schema: z
      .object({
        state: z
          .enum(["open", "in_progress", "answered", "resolved", "withdrawn"])
          .optional(),
        teacherId: uuid.optional(),
        subject: short.optional(),
        q: z.string().max(100).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(10000).optional(),
      })
      .strict(),
  },
  "queries/fallback": {
    rpc: "set_query_fallback",
    schema: z.object({ hours: z.number().int().min(1).max(336) }).strict(),
  },
  "owner/usage": { rpc: "owner_usage", schema: z.object({}).strict() },
  schools: {
    rpc: "create_school",
    schema: z
      .object({
        code: z.string().regex(/^[a-z0-9-]{2,32}$/),
        name: short,
        timezone: short,
        plan: short,
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        teacherLimit: z.number().int().min(0),
        studentLimit: z.number().int().min(0),
        aiLimit: z.number().int().min(0),
        storageLimit: z.number().int().positive().optional(),
      })
      .strict(),
  },
  "students/enroll": {
    rpc: "enroll_student",
    schema: z
      .object({
        classId: uuid,
        studentId: uuid,
        roll: short,
        revision: rev.optional(),
        reason: short.optional(),
      })
      .strict(),
  },
  "accounts/deactivate": {
    rpc: "deactivate_user",
    schema: z
      .object({
        userId: uuid,
        reason: short,
        articlePolicy: z.enum(["retain", "unpublish"]).optional(),
      })
      .strict(),
  },
  "accounts/force-logout": {
    rpc: "force_logout",
    schema: z.object({ userId: uuid, reason: short }).strict(),
  },
  "notifications/read": {
    rpc: "mark_notification",
    schema: z.object({ id: uuid }).strict(),
  },
  "exams/cancel": {
    rpc: "cancel_exam",
    schema: z.object({ versionId: uuid, reason: short }).strict(),
  },
  "integrity/events": {
    rpc: "record_integrity",
    schema: z
      .object({
        attemptId: uuid,
        type: z.enum([
          "visibility_loss",
          "fullscreen_exit",
          "refresh",
          "disconnect",
        ]),
        clientAt: z.string().datetime().optional(),
      })
      .strict(),
  },
  "integrity/reviews": {
    rpc: "review_integrity",
    schema: z
      .object({
        attemptId: uuid,
        outcome: z.enum(["cleared", "warning", "invalidated", "appeal"]),
        reason: short,
      })
      .strict(),
  },
  "questions/drafts": {
    rpc: "save_question_draft",
    schema: z
      .object({
        id: uuid.optional(),
        revision: rev.optional(),
        rawText: text,
        content: z.unknown(),
      })
      .strict(),
  },
  "support/metadata": {
    rpc: "support_metadata",
    schema: z.object({ studentId: uuid, reason: short }).strict(),
  },
  "profiles/manage": {
    rpc: "manage_profile",
    schema: z
      .object({
        action: z.enum(["create", "draft", "approve", "unpublish"]),
        teacherId: uuid.optional(),
        profileId: uuid.optional(),
        revisionId: uuid.optional(),
        photoAttachmentId: uuid.optional(),
        displayName: short.optional(),
        designation: short.optional(),
        subjects: z.array(short).optional(),
        classes: z.array(short).optional(),
        content: z
          .object({
            biography: text,
            teachingApproach: text,
            qualifications: text,
            experience: text,
          })
          .strict()
          .optional(),
        audience: z.enum(["school", "public"]).optional(),
        reason: short,
      })
      .strict(),
  },
  "profiles/updates": {
    rpc: "professional_update",
    schema: z
      .object({
        action: z.enum(["submit", "approve"]),
        profileId: uuid,
        id: uuid.optional(),
        title: short.optional(),
        kind: z
          .enum(["workshop", "certification", "project", "resource"])
          .optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        evidenceReference: short.optional(),
      })
      .strict(),
  },
  "profiles/detail": {
    rpc: "profile_detail",
    schema: z.object({ profileId: uuid }).strict(),
  },
  "schools/public-policy": {
    rpc: "set_public_policy",
    schema: z
      .object({
        enabled: z.boolean(),
        indexingEnabled: z.boolean(),
        reason: short,
      })
      .strict(),
  },
  "insights/correct": {
    rpc: "correct_insight",
    schema: z
      .object({
        studentId: uuid,
        correction: text,
        suppressed: z.boolean(),
        reason: short,
      })
      .strict(),
  },
  "schools/terms": {
    rpc: "manage_term",
    schema: z
      .object({
        id: uuid.optional(),
        revision: z.number().int().positive().optional(),
        academicYear: short,
        name: short,
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        reason: short,
      })
      .strict(),
  },
  "reports/statistics": {
    rpc: "learning_statistics",
    schema: z
      .object({
        studentId: uuid.optional(),
        academicYear: short.optional(),
        classId: uuid.optional(),
        section: short.optional(),
        subject: short.optional(),
        termId: uuid.optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .strict(),
  },
  "reports/exports": {
    rpc: "request_export",
    schema: z
      .object({
        studentId: uuid,
        academicYear: short.optional(),
        classId: uuid.optional(),
        section: short.optional(),
        format: z.enum(["csv", "printable"]).default("csv"),
        subject: short.optional(),
        termId: uuid.optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .strict(),
  },
  "accounts/login-id": {
    rpc: "change_login",
    schema: z
      .object({ loginId: z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/) })
      .strict(),
  },
  "support/end": {
    rpc: "end_support",
    schema: z.object({ id: uuid }).strict(),
  },
  "resources/reassign": {
    rpc: "reassign_resource",
    schema: z
      .object({
        id: uuid,
        kind: z.enum(["group", "query", "exam"]),
        teacherId: uuid,
        reason: short,
      })
      .strict(),
  },
  "questions/format": {
    rpc: "request_formatting",
    schema: z.object({ draftId: uuid }).strict(),
  },
  "jobs/status": { rpc: "job_status", schema: z.object({ id: uuid }).strict() },
  "files/status": {
    rpc: "file_status",
    schema: z.object({ id: uuid }).strict(),
  },
  "dashboard/student": { rpc: "student_home", schema: z.object({}).strict() },
  "groups/posts/read": {
    rpc: "read_post",
    schema: z.object({ id: uuid }).strict(),
  },
  "reports/school": {
    rpc: "school_report",
    schema: z
      .object({
        classId: uuid.optional(),
        subject: short.optional(),
        termId: uuid.optional(),
        academicYear: short.optional(),
        section: short.optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(10000).optional(),
      })
      .strict(),
  },
  "resources/coteachers": {
    rpc: "manage_coteacher",
    schema: z
      .object({
        id: uuid,
        kind: z.enum(["group", "query"]),
        teacherId: uuid,
        reason: short,
      })
      .strict(),
  },
  "groups/archive": {
    rpc: "archive_group",
    schema: z.object({ id: uuid, reason: short }).strict(),
  },
  "students/feedback": {
    rpc: "save_feedback",
    schema: z
      .object({
        studentId: uuid,
        classId: uuid,
        subject: short,
        body: text,
        visibility: z.enum(["student", "staff"]),
      })
      .strict(),
  },
  "students/staff-notes": {
    rpc: "staff_notes",
    schema: z.object({ studentId: uuid }).strict(),
  },
  topics: {
    rpc: "create_topic",
    schema: z.object({ subject: short, name: short }).strict(),
  },
  "exams/counts": {
    rpc: "conduct_counts",
    schema: z.object({ versionId: uuid }).strict(),
  },
  "students/profile": {
    rpc: "edit_student",
    schema: z
      .object({ studentId: uuid, revision: rev, name: short, reason: short })
      .strict(),
  },
  "students/list": {
    rpc: "student_roster",
    schema: z
      .object({
        classId: uuid.optional(),
        academicYear: short.optional(),
        includeInactive: z.boolean().optional(),
        q: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(10000).optional(),
      })
      .strict(),
  },
  "students/move": {
    rpc: "move_student",
    schema: z
      .object({
        studentId: uuid,
        fromClassId: uuid,
        toClassId: uuid,
        roll: short,
        revision: rev,
        reason: short,
      })
      .strict(),
  },
  "students/withdraw": {
    rpc: "withdraw_enrollment",
    schema: z
      .object({ studentId: uuid, classId: uuid, revision: rev, reason: short })
      .strict(),
  },
  "assignments/remove": {
    rpc: "remove_assignment",
    schema: z
      .object({ teacherId: uuid, classId: uuid, subject: short, reason: short })
      .strict(),
  },
  "directory/assigned": {
    rpc: "assigned_directory",
    schema: z
      .object({
        classId: uuid.optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(10000).optional(),
      })
      .strict(),
  },
  "profiles/details": {
    rpc: "update_profile_details",
    schema: z
      .object({
        profileId: uuid,
        revision: rev,
        displayName: short,
        designation: short,
        qualifications: text,
        experience: text,
        contact: z
          .object({ kind: z.enum(["email", "url", "office"]), value: short })
          .strict()
          .optional(),
        reason: short,
      })
      .strict(),
  },
  "students/discover": {
    rpc: "discover_student",
    schema: z.object({ admissionNumber: short }).strict(),
  },
  "teachers/internal-report": {
    rpc: "internal_teacher_report",
    schema: z.object({ teacherId: uuid.optional() }).strict(),
  },
  classes: {
    rpc: "create_class",
    schema: z
      .object({ academicYear: short, name: short, section: short })
      .strict(),
  },
  assignments: {
    rpc: "assign_teacher",
    schema: z
      .object({ teacherId: uuid, classId: uuid, subject: short })
      .strict(),
  },
  "exams/publish": {
    rpc: "publish_exam",
    schema: paper.extend({ classId: uuid }).strict(),
  },
  "attempts/start": {
    rpc: "start_attempt",
    schema: z.object({ versionId: uuid, writer: uuid }).strict(),
  },
  "attempts/answers": {
    rpc: "save_answer",
    schema: answerSave.extend({ attemptId: uuid }).strict(),
  },
  "attempts/submit": {
    rpc: "submit_attempt",
    schema: z.object({ attemptId: uuid, writer: uuid }).strict(),
  },
  "grades/review": {
    rpc: "review_grade",
    schema: z
      .object({
        attemptId: uuid,
        questionId: uuid,
        score: z.number().int().min(0),
        revision: rev,
        feedback: text,
        reason: short,
      })
      .strict(),
  },
  "grades/details": {
    rpc: "review_details",
    schema: z.object({ attemptId: uuid }).strict(),
  },
  "results/publish": {
    rpc: "publish_result",
    schema: z.object({ attemptId: uuid, reason: short }).strict(),
  },
  groups: {
    rpc: "create_group",
    schema: z.object({ classId: uuid, subject: short, title: short }).strict(),
  },
  "groups/members": {
    rpc: "set_group_member",
    schema: z
      .object({
        groupId: uuid,
        studentId: uuid,
        state: z.enum(["pending", "active", "rejected", "removed"]),
      })
      .strict(),
  },
  "groups/posts": {
    rpc: "write_post",
    schema: z
      .object({
        groupId: uuid,
        postId: uuid.optional(),
        revision: rev.optional(),
        title: short,
        body: text,
        pinned: z.boolean().optional(),
        deleted: z.boolean().optional(),
      })
      .strict(),
  },
  "queries/policy": {
    rpc: "set_query_policy",
    schema: z
      .object({
        classId: uuid,
        subject: short,
        hours: z.number().int().min(1).max(336),
      })
      .strict(),
  },
  queries: { rpc: "create_query", schema: queryInput },
  "queries/replies": {
    rpc: "reply_query",
    schema: z
      .object({
        queryId: uuid,
        kind: z.enum([
          "reply",
          "solution",
          "information_request",
          "clarification",
        ]),
        body: text,
      })
      .strict(),
  },
  "queries/state": {
    rpc: "transition_query",
    schema: z
      .object({
        queryId: uuid,
        state: z.enum(["resolved", "withdrawn"]),
        reason: short.optional(),
      })
      .strict(),
  },
  "queries/deadline": {
    rpc: "revise_deadline",
    schema: z
      .object({
        queryId: uuid,
        dueAt: z.string().datetime(),
        revision: rev,
        reason: short,
      })
      .strict(),
  },
  "articles/revisions": {
    rpc: "write_article",
    schema: z
      .object({
        profileId: uuid,
        articleId: uuid.optional(),
        revision: rev.optional(),
        title: short,
        summary: text,
        subject: short,
        body: text,
        state: z.enum(["draft", "submitted"]),
        reason: short.optional(),
      })
      .strict(),
  },
  "articles/moderation": {
    rpc: "moderate_article",
    schema: z
      .object({
        articleId: uuid,
        revisionId: uuid.optional(),
        action: z.enum([
          "publish",
          "unpublish",
          "archive",
          "changes_requested",
        ]),
        revision: rev.optional(),
        audience: z.enum(["school", "public"]).optional(),
        assetIds: z.array(uuid).max(5).optional(),
        reason: short,
      })
      .strict(),
  },
  "articles/trusted-publisher": {
    rpc: "manage_publisher",
    schema: z
      .object({
        teacherId: uuid,
        audience: z.enum(["school", "public"]),
        action: z.enum(["grant", "revoke"]),
        expiresAt: z.string().datetime().optional(),
        reason: short,
      })
      .strict(),
  },
  "articles/detail": {
    rpc: "article_detail",
    schema: z.object({ articleId: uuid }).strict(),
  },
  "publications/status": {
    rpc: "publication_status",
    schema: z
      .object({ articleId: uuid.optional(), profileId: uuid.optional() })
      .strict(),
  },
  "publications/retry": {
    rpc: "retry_publication_asset",
    schema: z.object({ id: uuid, reason: short }).strict(),
  },
  "articles/list": {
    rpc: "profile_articles",
    schema: z
      .object({
        profileId: uuid,
        subject: short.optional(),
        q: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(10000).optional(),
      })
      .strict(),
  },
  "reports/student": {
    rpc: "student_progress",
    schema: z
      .object({
        studentId: uuid.optional(),
        academicYear: short.optional(),
        classId: uuid.optional(),
        section: short.optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(10000).optional(),
        subject: short.optional(),
        termId: uuid.optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .strict(),
  },
  "directory/search": {
    rpc: "directory",
    schema: z
      .object({
        q: z.string().max(100).optional(),
        subject: short.optional(),
        className: short.optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(10000).optional(),
      })
      .strict(),
  },
} as const;
export const listFilters = {
  id: "uuid",
  school_id: "uuid",
  teacher_id: "uuid",
  class_id: "uuid",
  student_id: "uuid",
  profile_id: "uuid",
  version_id: "uuid",
  attempt_id: "uuid",
  question_id: "uuid",
  group_id: "uuid",
  query_id: "uuid",
  article_id: "uuid",
  job_id: "uuid",
  recipient_id: "uuid",
  role: "text",
  academic_year: "text",
  section: "text",
  subject: "text",
  state: "text",
} as const;
export const readTables = {
  schools: {
    table: "schools",
    select: "id,code,name,timezone,status,public_enabled,indexing_enabled",
  },
  subscriptions: {
    table: "subscriptions",
    select:
      "school_id,plan,starts_at,ends_at,teacher_limit,student_limit,ai_limit,storage_limit,insight_limit",
  },
  classes: { table: "classes", select: "id,academic_year,name,section" },
  assignments: {
    table: "teacher_assignments",
    select: "teacher_id,class_id,subject",
    order: "teacher_id.asc,class_id.asc,subject.asc",
  },
  users: {
    table: "memberships",
    select: "id,role,display_name,active,profile_revision",
  },
  enrollments: {
    table: "enrollments",
    select: "class_id,student_id,roll,active,revision",
  },
  drafts: { table: "question_drafts", select: "id,raw_text,content,revision" },
  profiles: {
    table: "teacher_profiles",
    select:
      "id,teacher_id,display_name,designation,subjects,classes,approved_fields,visible,audience,revision,published_at",
  },
  "professional-updates": {
    table: "professional_updates",
    select: "id,profile_id,title,kind,date,approved",
  },
  "profile-revisions": {
    table: "profile_revisions",
    select: "id,profile_id,author_id,content,state,created_at",
  },
  "article-records": {
    table: "teacher_articles",
    select:
      "id,author_id,profile_id,published_revision,audience,published_at,archived,revision",
  },
  "import-jobs": { table: "import_jobs", select: "id,state,created_at" },
  "import-rows": {
    table: "import_rows",
    select: "job_id,row_number,state,student_id,error_code,preview",
    order: "job_id.asc,row_number.asc",
  },
  "report-exports": {
    table: "report_exports",
    select: "id,filters,status,created_at,expires_at",
  },
  terms: {
    table: "school_terms",
    select: "id,academic_year,name,starts_at,ends_at,revision",
  },
  exams: {
    table: "exam_versions",
    select:
      "id,title,subject,instructions,opens_at,closes_at,duration_seconds,last_start_at,status",
  },
  questions: {
    table: "exam_questions",
    select: "id,version_id,position,type,maximum,content",
  },
  attempts: {
    table: "attempts",
    select:
      "id,version_id,started_at,deadline,finalized_at,status,writer_epoch,display_order,receipt",
  },
  answers: {
    table: "answers",
    select: "attempt_id,question_id,response,revision,saved_at",
  },
  results: {
    table: "results",
    select:
      "id,attempt_id,version_id,student_id,revision,published_at,total,maximum,scores",
  },
  groups: {
    table: "groups",
    select: "id,class_id,teacher_id,subject,title,archived",
  },
  posts: {
    table: "posts",
    order: "pinned.desc,created_at.desc,id.asc",
    select: "id,group_id,author_id,title,body,pinned,revision,created_at",
  },
  queries: {
    table: "queries",
    select:
      "id,student_id,teacher_id,class_id,subject,topic,state,cycle,created_at",
  },
  "query-messages": {
    table: "query_messages",
    select: "id,query_id,cycle,author_id,body,kind,created_at",
  },
  "query-cycles": {
    table: "query_cycles",
    order: "query_id.asc,cycle.asc",
    select:
      "query_id,cycle,teacher_id,policy_hours,policy_revision,started_at,original_due_at,due_at,deadline_revision,first_response_at,solution_delivered_at,student_resolved_at",
  },
  notifications: {
    table: "notifications",
    select: "id,type,resource_id,metadata,created_at,read_at",
  },
  articles: {
    table: "article_revisions",
    select: "id,article_id,title,summary,subject,body,state,created_at",
  },
  audit: {
    table: "audit_events",
    select:
      "id,actor_id,actor_role,subject_id,action,reason,changes,created_at",
  },
  insights: {
    table: "student_insights",
    select:
      "student_id,source_version,status,content,correction,suppressed,updated_at",
  },
} as const;
