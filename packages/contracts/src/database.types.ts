export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      answers: {
        Row: {
          attempt_id: string;
          question_id: string;
          response: Json;
          revision: number;
          saved_at: string;
          school_id: string;
        };
        Insert: {
          attempt_id: string;
          question_id: string;
          response: Json;
          revision: number;
          saved_at?: string;
          school_id: string;
        };
        Update: {
          attempt_id?: string;
          question_id?: string;
          response?: Json;
          revision?: number;
          saved_at?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "answers_school_id_attempt_id_fkey";
            columns: ["school_id", "attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      article_revisions: {
        Row: {
          article_id: string;
          body: string;
          created_at: string;
          editor_id: string;
          id: string;
          school_id: string;
          state: string;
          subject: string;
          summary: string;
          title: string;
        };
        Insert: {
          article_id: string;
          body: string;
          created_at?: string;
          editor_id: string;
          id?: string;
          school_id: string;
          state?: string;
          subject: string;
          summary: string;
          title: string;
        };
        Update: {
          article_id?: string;
          body?: string;
          created_at?: string;
          editor_id?: string;
          id?: string;
          school_id?: string;
          state?: string;
          subject?: string;
          summary?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_revisions_school_id_article_id_fkey";
            columns: ["school_id", "article_id"];
            isOneToOne: false;
            referencedRelation: "teacher_articles";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      attachments: {
        Row: {
          charged: boolean;
          checksum: string;
          created_at: string;
          declared_type: string;
          detected_type: string | null;
          filename: string;
          id: string;
          object_key: string;
          post_id: string | null;
          query_message_id: string | null;
          school_id: string;
          size: number;
          state: string;
          uploader_id: string;
        };
        Insert: {
          charged?: boolean;
          checksum: string;
          created_at?: string;
          declared_type: string;
          detected_type?: string | null;
          filename: string;
          id?: string;
          object_key: string;
          post_id?: string | null;
          query_message_id?: string | null;
          school_id: string;
          size: number;
          state?: string;
          uploader_id: string;
        };
        Update: {
          charged?: boolean;
          checksum?: string;
          created_at?: string;
          declared_type?: string;
          detected_type?: string | null;
          filename?: string;
          id?: string;
          object_key?: string;
          post_id?: string | null;
          query_message_id?: string | null;
          school_id?: string;
          size?: number;
          state?: string;
          uploader_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attachments_school_id_post_id_fkey";
            columns: ["school_id", "post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "attachments_school_id_query_message_id_fkey";
            columns: ["school_id", "query_message_id"];
            isOneToOne: false;
            referencedRelation: "query_messages";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      attempts: {
        Row: {
          deadline: string;
          display_order: Json;
          finalized_at: string | null;
          id: string;
          receipt: string | null;
          school_id: string;
          started_at: string;
          status: string;
          student_id: string;
          version_id: string;
          writer: string;
          writer_epoch: number;
        };
        Insert: {
          deadline: string;
          display_order: Json;
          finalized_at?: string | null;
          id?: string;
          receipt?: string | null;
          school_id: string;
          started_at?: string;
          status?: string;
          student_id: string;
          version_id: string;
          writer: string;
          writer_epoch?: number;
        };
        Update: {
          deadline?: string;
          display_order?: Json;
          finalized_at?: string | null;
          id?: string;
          receipt?: string | null;
          school_id?: string;
          started_at?: string;
          status?: string;
          student_id?: string;
          version_id?: string;
          writer?: string;
          writer_epoch?: number;
        };
        Relationships: [
          {
            foreignKeyName: "attempts_school_id_version_id_fkey";
            columns: ["school_id", "version_id"];
            isOneToOne: false;
            referencedRelation: "exam_versions";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "attempts_version_id_student_id_fkey";
            columns: ["version_id", "student_id"];
            isOneToOne: true;
            referencedRelation: "exam_recipients";
            referencedColumns: ["version_id", "student_id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string;
          actor_role: string;
          changes: Json;
          correlation_id: string;
          created_at: string;
          id: string;
          reason: string | null;
          school_id: string | null;
          subject_id: string | null;
        };
        Insert: {
          action: string;
          actor_id: string;
          actor_role: string;
          changes?: Json;
          correlation_id?: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
          school_id?: string | null;
          subject_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string;
          actor_role?: string;
          changes?: Json;
          correlation_id?: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
          school_id?: string | null;
          subject_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          academic_year: string;
          id: string;
          name: string;
          school_id: string;
          section: string;
        };
        Insert: {
          academic_year: string;
          id?: string;
          name: string;
          school_id: string;
          section: string;
        };
        Update: {
          academic_year?: string;
          id?: string;
          name?: string;
          school_id?: string;
          section?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      content_publications: {
        Row: {
          article_id: string | null;
          audience: string;
          cache_version: number;
          id: string;
          profile_id: string | null;
          revoked_at: string | null;
          school_id: string;
        };
        Insert: {
          article_id?: string | null;
          audience: string;
          cache_version?: number;
          id?: string;
          profile_id?: string | null;
          revoked_at?: string | null;
          school_id: string;
        };
        Update: {
          article_id?: string | null;
          audience?: string;
          cache_version?: number;
          id?: string;
          profile_id?: string | null;
          revoked_at?: string | null;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_publications_school_id_article_id_fkey";
            columns: ["school_id", "article_id"];
            isOneToOne: false;
            referencedRelation: "teacher_articles";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "content_publications_school_id_profile_id_fkey";
            columns: ["school_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "teacher_profiles";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      curriculum_topics: {
        Row: {
          id: string;
          name: string;
          school_id: string;
          subject: string;
        };
        Insert: {
          id?: string;
          name: string;
          school_id: string;
          subject: string;
        };
        Update: {
          id?: string;
          name?: string;
          school_id?: string;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "curriculum_topics_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      deadline_revisions: {
        Row: {
          actor_id: string;
          created_at: string;
          cycle: number;
          id: string;
          new_due_at: string;
          old_due_at: string;
          query_id: string;
          reason: string;
          school_id: string;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          cycle: number;
          id?: string;
          new_due_at: string;
          old_due_at: string;
          query_id: string;
          reason: string;
          school_id: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          cycle?: number;
          id?: string;
          new_due_at?: string;
          old_due_at?: string;
          query_id?: string;
          reason?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deadline_revisions_query_id_cycle_fkey";
            columns: ["query_id", "cycle"];
            isOneToOne: false;
            referencedRelation: "query_cycles";
            referencedColumns: ["query_id", "cycle"];
          },
        ];
      };
      enrollments: {
        Row: {
          active: boolean;
          class_id: string;
          roll: string;
          school_id: string;
          student_id: string;
        };
        Insert: {
          active?: boolean;
          class_id: string;
          roll: string;
          school_id: string;
          student_id: string;
        };
        Update: {
          active?: boolean;
          class_id?: string;
          roll?: string;
          school_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_school_id_class_id_fkey";
            columns: ["school_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "enrollments_school_id_student_id_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "student_registry";
            referencedColumns: ["school_id", "student_id"];
          },
        ];
      };
      exam_managers: {
        Row: {
          school_id: string;
          teacher_id: string;
          version_id: string;
        };
        Insert: {
          school_id: string;
          teacher_id: string;
          version_id: string;
        };
        Update: {
          school_id?: string;
          teacher_id?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_managers_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "exam_managers_school_id_version_id_fkey";
            columns: ["school_id", "version_id"];
            isOneToOne: false;
            referencedRelation: "exam_versions";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      exam_questions: {
        Row: {
          content: Json;
          id: string;
          maximum: number;
          position: number;
          school_id: string;
          type: string;
          version_id: string;
        };
        Insert: {
          content: Json;
          id: string;
          maximum: number;
          position: number;
          school_id: string;
          type: string;
          version_id: string;
        };
        Update: {
          content?: Json;
          id?: string;
          maximum?: number;
          position?: number;
          school_id?: string;
          type?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_questions_school_id_version_id_fkey";
            columns: ["school_id", "version_id"];
            isOneToOne: false;
            referencedRelation: "exam_versions";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      exam_recipients: {
        Row: {
          closes_at: string;
          exempt: boolean;
          extra_seconds: number;
          school_id: string;
          student_id: string;
          version_id: string;
        };
        Insert: {
          closes_at: string;
          exempt?: boolean;
          extra_seconds?: number;
          school_id: string;
          student_id: string;
          version_id: string;
        };
        Update: {
          closes_at?: string;
          exempt?: boolean;
          extra_seconds?: number;
          school_id?: string;
          student_id?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_recipients_school_id_student_id_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "student_registry";
            referencedColumns: ["school_id", "student_id"];
          },
          {
            foreignKeyName: "exam_recipients_school_id_version_id_fkey";
            columns: ["school_id", "version_id"];
            isOneToOne: false;
            referencedRelation: "exam_versions";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      exam_versions: {
        Row: {
          class_id: string;
          closes_at: string;
          created_at: string;
          duration_seconds: number;
          id: string;
          instructions: string;
          last_start_at: string | null;
          opens_at: string;
          school_id: string;
          shuffle: boolean;
          status: string;
          subject: string;
          teacher_id: string;
          title: string;
        };
        Insert: {
          class_id: string;
          closes_at: string;
          created_at?: string;
          duration_seconds: number;
          id?: string;
          instructions: string;
          last_start_at?: string | null;
          opens_at: string;
          school_id: string;
          shuffle?: boolean;
          status?: string;
          subject: string;
          teacher_id: string;
          title: string;
        };
        Update: {
          class_id?: string;
          closes_at?: string;
          created_at?: string;
          duration_seconds?: number;
          id?: string;
          instructions?: string;
          last_start_at?: string | null;
          opens_at?: string;
          school_id?: string;
          shuffle?: boolean;
          status?: string;
          subject?: string;
          teacher_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_versions_school_id_class_id_fkey";
            columns: ["school_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "exam_versions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_versions_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      group_memberships: {
        Row: {
          group_id: string;
          school_id: string;
          state: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          group_id: string;
          school_id: string;
          state: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          group_id?: string;
          school_id?: string;
          state?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_memberships_school_id_group_id_fkey";
            columns: ["school_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "group_memberships_school_id_student_id_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "student_registry";
            referencedColumns: ["school_id", "student_id"];
          },
        ];
      };
      group_teachers: {
        Row: {
          group_id: string;
          school_id: string;
          teacher_id: string;
        };
        Insert: {
          group_id: string;
          school_id: string;
          teacher_id: string;
        };
        Update: {
          group_id?: string;
          school_id?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_teachers_school_id_group_id_fkey";
            columns: ["school_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "group_teachers_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      groups: {
        Row: {
          archived: boolean;
          class_id: string;
          id: string;
          school_id: string;
          subject: string;
          teacher_id: string;
          title: string;
        };
        Insert: {
          archived?: boolean;
          class_id: string;
          id?: string;
          school_id: string;
          subject: string;
          teacher_id: string;
          title: string;
        };
        Update: {
          archived?: boolean;
          class_id?: string;
          id?: string;
          school_id?: string;
          subject?: string;
          teacher_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_school_id_class_id_fkey";
            columns: ["school_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "groups_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      import_jobs: {
        Row: {
          actor_id: string;
          checksum: string;
          created_at: string;
          id: string;
          idempotency_key: string;
          school_id: string;
          state: string;
        };
        Insert: {
          actor_id: string;
          checksum: string;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          school_id: string;
          state?: string;
        };
        Update: {
          actor_id?: string;
          checksum?: string;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          school_id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_jobs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "import_jobs_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      import_rows: {
        Row: {
          error_code: string | null;
          identity_key: string;
          job_id: string;
          preview: Json;
          row_number: number;
          school_id: string;
          state: string;
          student_id: string | null;
        };
        Insert: {
          error_code?: string | null;
          identity_key: string;
          job_id: string;
          preview: Json;
          row_number: number;
          school_id: string;
          state: string;
          student_id?: string | null;
        };
        Update: {
          error_code?: string | null;
          identity_key?: string;
          job_id?: string;
          preview?: Json;
          row_number?: number;
          school_id?: string;
          state?: string;
          student_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "import_rows_school_id_job_id_fkey";
            columns: ["school_id", "job_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      integrity_events: {
        Row: {
          attempt_id: string;
          client_at: string | null;
          id: string;
          received_at: string;
          school_id: string;
          student_id: string;
          type: string;
        };
        Insert: {
          attempt_id: string;
          client_at?: string | null;
          id?: string;
          received_at?: string;
          school_id: string;
          student_id: string;
          type: string;
        };
        Update: {
          attempt_id?: string;
          client_at?: string | null;
          id?: string;
          received_at?: string;
          school_id?: string;
          student_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integrity_events_school_id_attempt_id_fkey";
            columns: ["school_id", "attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      integrity_reviews: {
        Row: {
          actor_id: string;
          attempt_id: string;
          created_at: string;
          id: string;
          outcome: string;
          reason: string;
          school_id: string;
        };
        Insert: {
          actor_id: string;
          attempt_id: string;
          created_at?: string;
          id?: string;
          outcome: string;
          reason: string;
          school_id: string;
        };
        Update: {
          actor_id?: string;
          attempt_id?: string;
          created_at?: string;
          id?: string;
          outcome?: string;
          reason?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integrity_reviews_school_id_attempt_id_fkey";
            columns: ["school_id", "attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      memberships: {
        Row: {
          active: boolean;
          auth_revoked_before: string | null;
          created_at: string;
          credential_policy: string;
          credential_version: number;
          display_name: string;
          id: string;
          must_change_password: boolean;
          role: string;
          school_id: string | null;
        };
        Insert: {
          active?: boolean;
          auth_revoked_before?: string | null;
          created_at?: string;
          credential_policy?: string;
          credential_version?: number;
          display_name: string;
          id: string;
          must_change_password?: boolean;
          role: string;
          school_id?: string | null;
        };
        Update: {
          active?: boolean;
          auth_revoked_before?: string | null;
          created_at?: string;
          credential_policy?: string;
          credential_version?: number;
          display_name?: string;
          id?: string;
          must_change_password?: boolean;
          role?: string;
          school_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          event_key: string;
          id: string;
          metadata: Json;
          obsolete: boolean;
          read_at: string | null;
          recipient_id: string;
          resource_id: string | null;
          school_id: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          event_key: string;
          id?: string;
          metadata?: Json;
          obsolete?: boolean;
          read_at?: string | null;
          recipient_id: string;
          resource_id?: string | null;
          school_id: string;
          type: string;
        };
        Update: {
          created_at?: string;
          event_key?: string;
          id?: string;
          metadata?: Json;
          obsolete?: boolean;
          read_at?: string | null;
          recipient_id?: string;
          resource_id?: string | null;
          school_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_recipient_id_fkey";
            columns: ["school_id", "recipient_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      outbox: {
        Row: {
          attempts: number;
          available_at: string;
          created_at: string;
          dedup_key: string;
          error_code: string | null;
          id: string;
          kind: string;
          lease_until: string | null;
          payload: Json;
          result: Json | null;
          run_token: string | null;
          school_id: string;
          status: string;
        };
        Insert: {
          attempts?: number;
          available_at?: string;
          created_at?: string;
          dedup_key: string;
          error_code?: string | null;
          id?: string;
          kind: string;
          lease_until?: string | null;
          payload: Json;
          result?: Json | null;
          run_token?: string | null;
          school_id: string;
          status?: string;
        };
        Update: {
          attempts?: number;
          available_at?: string;
          created_at?: string;
          dedup_key?: string;
          error_code?: string | null;
          id?: string;
          kind?: string;
          lease_until?: string | null;
          payload?: Json;
          result?: Json | null;
          run_token?: string | null;
          school_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outbox_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      post_reads: {
        Row: {
          post_id: string;
          read_at: string;
          school_id: string;
          student_id: string;
        };
        Insert: {
          post_id: string;
          read_at?: string;
          school_id: string;
          student_id: string;
        };
        Update: {
          post_id?: string;
          read_at?: string;
          school_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_reads_school_id_post_id_fkey";
            columns: ["school_id", "post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      posts: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          deleted: boolean;
          group_id: string;
          id: string;
          pinned: boolean;
          revision: number;
          school_id: string;
          title: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          deleted?: boolean;
          group_id: string;
          id?: string;
          pinned?: boolean;
          revision?: number;
          school_id: string;
          title: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          deleted?: boolean;
          group_id?: string;
          id?: string;
          pinned?: boolean;
          revision?: number;
          school_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "posts_school_id_group_id_fkey";
            columns: ["school_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      professional_updates: {
        Row: {
          approved: boolean;
          date: string;
          evidence_reference: string | null;
          id: string;
          kind: string;
          profile_id: string;
          school_id: string;
          title: string;
        };
        Insert: {
          approved?: boolean;
          date: string;
          evidence_reference?: string | null;
          id?: string;
          kind: string;
          profile_id: string;
          school_id: string;
          title: string;
        };
        Update: {
          approved?: boolean;
          date?: string;
          evidence_reference?: string | null;
          id?: string;
          kind?: string;
          profile_id?: string;
          school_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professional_updates_school_id_profile_id_fkey";
            columns: ["school_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "teacher_profiles";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      profile_revisions: {
        Row: {
          author_id: string;
          content: Json;
          created_at: string;
          id: string;
          profile_id: string;
          school_id: string;
          state: string;
        };
        Insert: {
          author_id: string;
          content: Json;
          created_at?: string;
          id?: string;
          profile_id: string;
          school_id: string;
          state?: string;
        };
        Update: {
          author_id?: string;
          content?: Json;
          created_at?: string;
          id?: string;
          profile_id?: string;
          school_id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_revisions_school_id_profile_id_fkey";
            columns: ["school_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "teacher_profiles";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      public_assets: {
        Row: {
          approved: boolean;
          id: string;
          object_key: string;
          publication_id: string;
          revoked_at: string | null;
          school_id: string;
        };
        Insert: {
          approved?: boolean;
          id?: string;
          object_key: string;
          publication_id: string;
          revoked_at?: string | null;
          school_id: string;
        };
        Update: {
          approved?: boolean;
          id?: string;
          object_key?: string;
          publication_id?: string;
          revoked_at?: string | null;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "public_assets_publication_id_fkey";
            columns: ["publication_id"];
            isOneToOne: false;
            referencedRelation: "content_publications";
            referencedColumns: ["id"];
          },
        ];
      };
      queries: {
        Row: {
          class_id: string;
          created_at: string;
          cycle: number;
          id: string;
          school_id: string;
          state: string;
          student_id: string;
          subject: string;
          teacher_id: string;
          topic: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          cycle?: number;
          id?: string;
          school_id: string;
          state?: string;
          student_id: string;
          subject: string;
          teacher_id: string;
          topic: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          cycle?: number;
          id?: string;
          school_id?: string;
          state?: string;
          student_id?: string;
          subject?: string;
          teacher_id?: string;
          topic?: string;
        };
        Relationships: [
          {
            foreignKeyName: "queries_school_id_class_id_fkey";
            columns: ["school_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "queries_school_id_student_id_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "queries_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      query_cycles: {
        Row: {
          cycle: number;
          deadline_revision: number;
          due_at: string;
          first_response_at: string | null;
          original_due_at: string;
          policy_hours: number;
          policy_revision: number;
          query_id: string;
          school_id: string;
          solution_delivered_at: string | null;
          started_at: string;
          student_resolved_at: string | null;
          teacher_id: string;
        };
        Insert: {
          cycle: number;
          deadline_revision?: number;
          due_at: string;
          first_response_at?: string | null;
          original_due_at: string;
          policy_hours: number;
          policy_revision: number;
          query_id: string;
          school_id: string;
          solution_delivered_at?: string | null;
          started_at?: string;
          student_resolved_at?: string | null;
          teacher_id: string;
        };
        Update: {
          cycle?: number;
          deadline_revision?: number;
          due_at?: string;
          first_response_at?: string | null;
          original_due_at?: string;
          policy_hours?: number;
          policy_revision?: number;
          query_id?: string;
          school_id?: string;
          solution_delivered_at?: string | null;
          started_at?: string;
          student_resolved_at?: string | null;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "query_cycles_school_id_query_id_fkey";
            columns: ["school_id", "query_id"];
            isOneToOne: false;
            referencedRelation: "queries";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      query_messages: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          cycle: number;
          id: string;
          kind: string;
          query_id: string;
          school_id: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          cycle: number;
          id?: string;
          kind: string;
          query_id: string;
          school_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          cycle?: number;
          id?: string;
          kind?: string;
          query_id?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "query_messages_query_id_cycle_fkey";
            columns: ["query_id", "cycle"];
            isOneToOne: false;
            referencedRelation: "query_cycles";
            referencedColumns: ["query_id", "cycle"];
          },
          {
            foreignKeyName: "query_messages_school_id_query_id_fkey";
            columns: ["school_id", "query_id"];
            isOneToOne: false;
            referencedRelation: "queries";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      query_policies: {
        Row: {
          class_id: string;
          hours: number;
          revision: number;
          school_id: string;
          subject: string;
          teacher_id: string;
        };
        Insert: {
          class_id: string;
          hours: number;
          revision?: number;
          school_id: string;
          subject: string;
          teacher_id: string;
        };
        Update: {
          class_id?: string;
          hours?: number;
          revision?: number;
          school_id?: string;
          subject?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "query_policies_school_id_class_id_fkey";
            columns: ["school_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "query_policies_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      query_teachers: {
        Row: {
          query_id: string;
          school_id: string;
          teacher_id: string;
        };
        Insert: {
          query_id: string;
          school_id: string;
          teacher_id: string;
        };
        Update: {
          query_id?: string;
          school_id?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "query_teachers_school_id_query_id_fkey";
            columns: ["school_id", "query_id"];
            isOneToOne: false;
            referencedRelation: "queries";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "query_teachers_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      question_drafts: {
        Row: {
          author_id: string;
          content: Json;
          id: string;
          raw_text: string;
          revision: number;
          school_id: string;
        };
        Insert: {
          author_id: string;
          content: Json;
          id?: string;
          raw_text: string;
          revision?: number;
          school_id: string;
        };
        Update: {
          author_id?: string;
          content?: Json;
          id?: string;
          raw_text?: string;
          revision?: number;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_drafts_school_id_author_id_fkey";
            columns: ["school_id", "author_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "question_drafts_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      question_topic_tags: {
        Row: {
          is_primary: boolean;
          question_id: string;
          school_id: string;
          topic_id: string;
          version_id: string;
        };
        Insert: {
          is_primary?: boolean;
          question_id: string;
          school_id: string;
          topic_id: string;
          version_id: string;
        };
        Update: {
          is_primary?: boolean;
          question_id?: string;
          school_id?: string;
          topic_id?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_topic_tags_school_id_topic_id_fkey";
            columns: ["school_id", "topic_id"];
            isOneToOne: false;
            referencedRelation: "curriculum_topics";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "question_topic_tags_version_id_question_id_fkey";
            columns: ["version_id", "question_id"];
            isOneToOne: false;
            referencedRelation: "exam_questions";
            referencedColumns: ["version_id", "id"];
          },
        ];
      };
      report_exports: {
        Row: {
          actor_id: string;
          created_at: string;
          expires_at: string;
          filters: Json;
          id: string;
          object_key: string | null;
          school_id: string;
          source_fingerprint: string | null;
          source_version: number;
          status: string;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          expires_at?: string;
          filters: Json;
          id?: string;
          object_key?: string | null;
          school_id: string;
          source_fingerprint?: string | null;
          source_version: number;
          status?: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          expires_at?: string;
          filters?: Json;
          id?: string;
          object_key?: string | null;
          school_id?: string;
          source_fingerprint?: string | null;
          source_version?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_exports_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      results: {
        Row: {
          attempt_id: string;
          id: string;
          maximum: number;
          published_at: string;
          revision: number;
          school_id: string;
          scores: Json;
          student_id: string;
          total: number;
          version_id: string;
        };
        Insert: {
          attempt_id: string;
          id?: string;
          maximum: number;
          published_at?: string;
          revision?: number;
          school_id: string;
          scores: Json;
          student_id: string;
          total: number;
          version_id: string;
        };
        Update: {
          attempt_id?: string;
          id?: string;
          maximum?: number;
          published_at?: string;
          revision?: number;
          school_id?: string;
          scores?: Json;
          student_id?: string;
          total?: number;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "results_school_id_attempt_id_fkey";
            columns: ["school_id", "attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "results_school_id_student_id_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      school_terms: {
        Row: {
          academic_year: string;
          ends_at: string;
          id: string;
          name: string;
          revision: number;
          school_id: string;
          starts_at: string;
        };
        Insert: {
          academic_year: string;
          ends_at: string;
          id?: string;
          name: string;
          revision?: number;
          school_id: string;
          starts_at: string;
        };
        Update: {
          academic_year?: string;
          ends_at?: string;
          id?: string;
          name?: string;
          revision?: number;
          school_id?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_terms_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          code: string;
          id: string;
          indexing_enabled: boolean;
          name: string;
          public_enabled: boolean;
          status: string;
          timezone: string;
        };
        Insert: {
          code: string;
          id?: string;
          indexing_enabled?: boolean;
          name: string;
          public_enabled?: boolean;
          status?: string;
          timezone?: string;
        };
        Update: {
          code?: string;
          id?: string;
          indexing_enabled?: boolean;
          name?: string;
          public_enabled?: boolean;
          status?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      student_insights: {
        Row: {
          content: Json | null;
          correction: string | null;
          evidence: Json | null;
          model: string | null;
          prompt_version: string | null;
          school_id: string;
          source_version: number;
          status: string;
          student_id: string;
          suppressed: boolean;
          updated_at: string;
        };
        Insert: {
          content?: Json | null;
          correction?: string | null;
          evidence?: Json | null;
          model?: string | null;
          prompt_version?: string | null;
          school_id: string;
          source_version?: number;
          status?: string;
          student_id: string;
          suppressed?: boolean;
          updated_at?: string;
        };
        Update: {
          content?: Json | null;
          correction?: string | null;
          evidence?: Json | null;
          model?: string | null;
          prompt_version?: string | null;
          school_id?: string;
          source_version?: number;
          status?: string;
          student_id?: string;
          suppressed?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_insights_school_id_student_id_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "student_registry";
            referencedColumns: ["school_id", "student_id"];
          },
        ];
      };
      student_registry: {
        Row: {
          admission_number: string | null;
          school_id: string;
          student_id: string;
        };
        Insert: {
          admission_number?: string | null;
          school_id: string;
          student_id: string;
        };
        Update: {
          admission_number?: string | null;
          school_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_registry_school_id_student_id_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          ai_limit: number;
          ends_at: string;
          insight_limit: number;
          plan: string;
          school_id: string;
          starts_at: string;
          storage_limit: number;
          student_limit: number;
          teacher_limit: number;
        };
        Insert: {
          ai_limit: number;
          ends_at: string;
          insight_limit?: number;
          plan: string;
          school_id: string;
          starts_at: string;
          storage_limit?: number;
          student_limit: number;
          teacher_limit: number;
        };
        Update: {
          ai_limit?: number;
          ends_at?: string;
          insight_limit?: number;
          plan?: string;
          school_id?: string;
          starts_at?: string;
          storage_limit?: number;
          student_limit?: number;
          teacher_limit?: number;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: true;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_articles: {
        Row: {
          archived: boolean;
          audience: string;
          author_id: string;
          id: string;
          profile_id: string;
          published_at: string | null;
          published_revision: string | null;
          revision: number;
          school_id: string;
        };
        Insert: {
          archived?: boolean;
          audience?: string;
          author_id: string;
          id?: string;
          profile_id: string;
          published_at?: string | null;
          published_revision?: string | null;
          revision?: number;
          school_id: string;
        };
        Update: {
          archived?: boolean;
          audience?: string;
          author_id?: string;
          id?: string;
          profile_id?: string;
          published_at?: string | null;
          published_revision?: string | null;
          revision?: number;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_articles_published_revision_fkey";
            columns: ["published_revision"];
            isOneToOne: false;
            referencedRelation: "article_revisions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_articles_school_id_profile_id_fkey";
            columns: ["school_id", "profile_id"];
            isOneToOne: false;
            referencedRelation: "teacher_profiles";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      teacher_assignments: {
        Row: {
          class_id: string;
          school_id: string;
          subject: string;
          teacher_id: string;
        };
        Insert: {
          class_id: string;
          school_id: string;
          subject: string;
          teacher_id: string;
        };
        Update: {
          class_id?: string;
          school_id?: string;
          subject?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_school_id_class_id_fkey";
            columns: ["school_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "teacher_assignments_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      teacher_feedback: {
        Row: {
          body: string;
          class_id: string;
          created_at: string;
          id: string;
          school_id: string;
          student_id: string;
          subject: string;
          teacher_id: string;
        };
        Insert: {
          body: string;
          class_id: string;
          created_at?: string;
          id?: string;
          school_id: string;
          student_id: string;
          subject: string;
          teacher_id: string;
        };
        Update: {
          body?: string;
          class_id?: string;
          created_at?: string;
          id?: string;
          school_id?: string;
          student_id?: string;
          subject?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_feedback_school_id_class_id_fkey";
            columns: ["school_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["school_id", "id"];
          },
          {
            foreignKeyName: "teacher_feedback_school_id_student_id_fkey";
            columns: ["school_id", "student_id"];
            isOneToOne: false;
            referencedRelation: "student_registry";
            referencedColumns: ["school_id", "student_id"];
          },
        ];
      };
      teacher_profiles: {
        Row: {
          approved_fields: Json;
          audience: string;
          classes: string[];
          designation: string;
          display_name: string;
          id: string;
          published_at: string | null;
          revision: number;
          school_id: string;
          subjects: string[];
          teacher_id: string;
          visible: boolean;
        };
        Insert: {
          approved_fields?: Json;
          audience?: string;
          classes?: string[];
          designation?: string;
          display_name: string;
          id?: string;
          published_at?: string | null;
          revision?: number;
          school_id: string;
          subjects?: string[];
          teacher_id: string;
          visible?: boolean;
        };
        Update: {
          approved_fields?: Json;
          audience?: string;
          classes?: string[];
          designation?: string;
          display_name?: string;
          id?: string;
          published_at?: string | null;
          revision?: number;
          school_id?: string;
          subjects?: string[];
          teacher_id?: string;
          visible?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_profiles_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
      teacher_query_defaults: {
        Row: {
          hours: number;
          revision: number;
          school_id: string;
          teacher_id: string;
        };
        Insert: {
          hours: number;
          revision?: number;
          school_id: string;
          teacher_id: string;
        };
        Update: {
          hours?: number;
          revision?: number;
          school_id?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_query_defaults_school_id_teacher_id_fkey";
            columns: ["school_id", "teacher_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["school_id", "id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      archive_group: { Args: { p: Json }; Returns: undefined };
      assign_teacher: { Args: { p: Json }; Returns: undefined };
      cancel_exam: { Args: { p: Json }; Returns: undefined };
      change_login: { Args: { p: Json }; Returns: undefined };
      complete_upload: { Args: { p: Json }; Returns: undefined };
      conduct_counts: { Args: { p: Json }; Returns: Json };
      correct_insight: { Args: { p: Json }; Returns: undefined };
      create_class: { Args: { p: Json }; Returns: string };
      create_group: { Args: { p: Json }; Returns: string };
      create_query: { Args: { p: Json }; Returns: string };
      create_school: { Args: { p: Json }; Returns: string };
      create_topic: { Args: { p: Json }; Returns: string };
      deactivate_user: { Args: { p: Json }; Returns: undefined };
      directory: { Args: { p: Json }; Returns: Json };
      discover_student: { Args: { p: Json }; Returns: Json };
      edit_student: { Args: { p: Json }; Returns: undefined };
      end_support: { Args: { p: Json }; Returns: undefined };
      enroll_student: { Args: { p: Json }; Returns: undefined };
      export_download: { Args: { p: Json }; Returns: Json };
      force_logout: { Args: { p: Json }; Returns: undefined };
      formatting_input: { Args: { p: Json }; Returns: Json };
      import_row_outcome: { Args: { p: Json }; Returns: undefined };
      import_selection: { Args: { p: Json }; Returns: Json };
      internal_teacher_report: { Args: { p: Json }; Returns: Json };
      job_status: { Args: { p: Json }; Returns: Json };
      learning_statistics: { Args: { p: Json }; Returns: Json };
      manage_coteacher: { Args: { p: Json }; Returns: undefined };
      manage_profile: { Args: { p: Json }; Returns: string };
      manage_term: { Args: { p: Json }; Returns: string };
      mark_notification: { Args: { p: Json }; Returns: undefined };
      moderate_article: { Args: { p: Json }; Returns: undefined };
      owner_usage: { Args: { p: Json }; Returns: Json };
      prepare_credential_action: { Args: { p: Json }; Returns: Json };
      preview_import: { Args: { p: Json }; Returns: Json };
      professional_update: { Args: { p: Json }; Returns: string };
      profile_detail: { Args: { p: Json }; Returns: Json };
      publish_exam: { Args: { p: Json }; Returns: string };
      publish_result: { Args: { p: Json }; Returns: string };
      query_archive: { Args: { p: Json }; Returns: Json };
      read_post: { Args: { p: Json }; Returns: undefined };
      reassign_resource: { Args: { p: Json }; Returns: undefined };
      record_integrity: { Args: { p: Json }; Returns: string };
      reply_query: { Args: { p: Json }; Returns: string };
      request_export: { Args: { p: Json }; Returns: string };
      request_formatting: { Args: { p: Json }; Returns: string };
      reserve_account: { Args: { p: Json }; Returns: Json };
      reserve_upload: { Args: { p: Json }; Returns: Json };
      review_details: { Args: { p: Json }; Returns: Json };
      review_grade: { Args: { p: Json }; Returns: undefined };
      review_integrity: { Args: { p: Json }; Returns: undefined };
      revise_deadline: { Args: { p: Json }; Returns: undefined };
      runtime_claim: { Args: { p: Json }; Returns: Json };
      runtime_cleanup: { Args: { p: Json }; Returns: Json };
      runtime_credentials: { Args: { p: Json }; Returns: Json };
      runtime_credentials_revoke: { Args: { p: Json }; Returns: undefined };
      runtime_deleted_export: { Args: { p: Json }; Returns: undefined };
      runtime_dispatch: { Args: { p: Json }; Returns: Json };
      runtime_export_data: { Args: { p: Json }; Returns: Json };
      runtime_export_finish: { Args: { p: Json }; Returns: undefined };
      runtime_finish: { Args: { p: Json }; Returns: undefined };
      runtime_formatted: { Args: { p: Json }; Returns: undefined };
      runtime_login_lookup: { Args: { p: Json }; Returns: Json };
      runtime_owner_lookup: { Args: { p: Json }; Returns: Json };
      runtime_pending_provisioning: { Args: { p: Json }; Returns: Json };
      runtime_provision_activate: { Args: { p: Json }; Returns: undefined };
      runtime_provision_auth: { Args: { p: Json }; Returns: undefined };
      runtime_provision_claim: { Args: { p: Json }; Returns: Json };
      runtime_provision_failed: { Args: { p: Json }; Returns: undefined };
      runtime_rate: { Args: { p: Json }; Returns: boolean };
      runtime_reauthenticated: { Args: { p: Json }; Returns: undefined };
      runtime_reconcile_upload: { Args: { p: Json }; Returns: undefined };
      runtime_reserve_ai: { Args: { p: Json }; Returns: boolean };
      runtime_reserve_provider_call: { Args: { p: Json }; Returns: boolean };
      runtime_scan_finish: { Args: { p: Json }; Returns: undefined };
      runtime_session: { Args: { p: Json }; Returns: Json };
      runtime_session_create: { Args: { p: Json }; Returns: undefined };
      runtime_session_refresh: { Args: { p: Json }; Returns: undefined };
      runtime_session_revoke: { Args: { p: Json }; Returns: undefined };
      runtime_sweep: { Args: { p: Json }; Returns: Json };
      runtime_takeover: { Args: { p: Json }; Returns: Json };
      runtime_upload_candidates: { Args: { p: Json }; Returns: Json };
      save_answer: { Args: { p: Json }; Returns: Json };
      save_feedback: { Args: { p: Json }; Returns: string };
      save_question_draft: { Args: { p: Json }; Returns: string };
      school_report: { Args: { p: Json }; Returns: Json };
      set_group_member: { Args: { p: Json }; Returns: undefined };
      set_public_policy: { Args: { p: Json }; Returns: undefined };
      set_query_fallback: { Args: { p: Json }; Returns: undefined };
      set_query_policy: { Args: { p: Json }; Returns: undefined };
      set_school_status: { Args: { p: Json }; Returns: undefined };
      staff_notes: { Args: { p: Json }; Returns: Json };
      start_attempt: { Args: { p: Json }; Returns: Json };
      student_home: { Args: { p: Json }; Returns: Json };
      student_progress: { Args: { p: Json }; Returns: Json };
      submit_attempt: { Args: { p: Json }; Returns: Json };
      support_metadata: { Args: { p: Json }; Returns: Json };
      takeover_attempt: { Args: { p: Json }; Returns: Json };
      transition_query: { Args: { p: Json }; Returns: undefined };
      update_subscription: { Args: { p: Json }; Returns: undefined };
      write_article: { Args: { p: Json }; Returns: string };
      write_post: { Args: { p: Json }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
