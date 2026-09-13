// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('ole_workspaces', {
 ownerId: text('owner_id').primaryKey(),
 state: text('state').notNull(),
 revision: integer('revision').notNull().default(0),
 updatedAt: text('updated_at').notNull(),
});
export const employeeAccounts = sqliteTable('ole_employee_accounts', {
 ownerId: text('owner_id').notNull(), employeeId: text('employee_id').notNull(),
 loginId: text('login_id').notNull(), passwordSalt: text('password_salt').notNull(), passwordHash: text('password_hash').notNull(),
 permissions: text('permissions').notNull(), visibleDepartments: text('visible_departments').notNull().default('[]'), active: integer('active',{mode:'boolean'}).notNull().default(true),
 failedAttempts: integer('failed_attempts').notNull().default(0), lockedUntil: text('locked_until'), updatedAt: text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.employeeId]}),uniqueIndex('ole_employee_login_id_unique').on(t.loginId)]);
export const employeeSessions = sqliteTable('ole_employee_sessions', {
 tokenHash: text('token_hash').primaryKey(), ownerId: text('owner_id').notNull(), employeeId: text('employee_id').notNull(),
 expiresAt: text('expires_at').notNull(), createdAt: text('created_at').notNull(), lastSeenAt: text('last_seen_at'),
},t=>[index('ole_employee_sessions_expiry').on(t.expiresAt),index('ole_employee_sessions_presence').on(t.ownerId,t.lastSeenAt)]);
export const permissionAudit = sqliteTable('ole_permission_audit', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), employeeId: text('employee_id').notNull(),
 permission: text('permission').notNull(), enabled: integer('enabled',{mode:'boolean'}).notNull(), actor: text('actor').notNull(), createdAt: text('created_at').notNull(),
},t=>[index('ole_permission_audit_employee').on(t.ownerId,t.employeeId,t.createdAt)]);
export const notificationDeliveries = sqliteTable('ole_notification_deliveries', {
 ownerId: text('owner_id').notNull(), notificationKey: text('notification_key').notNull(),
 sentAt: text('sent_at').notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.notificationKey]}),index('ole_notification_deliveries_sent_at').on(t.sentAt)]);
export const sopAttempts = sqliteTable('ole_sop_attempts', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), employeeId: text('employee_id').notNull(),
 planId: text('plan_id'),
 score: integer('score').notNull(), level: text('level').notNull(), criticalPassed: integer('critical_passed',{mode:'boolean'}).notNull(),
 correctCount: integer('correct_count').notNull(), totalQuestions: integer('total_questions').notNull(), completedAt: text('completed_at').notNull(),
},t=>[index('ole_sop_attempts_owner_completed').on(t.ownerId,t.completedAt),index('ole_sop_attempts_employee_completed').on(t.ownerId,t.employeeId,t.completedAt)]);
export const sopTopicVersions = sqliteTable('ole_sop_topic_versions', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), topicCode: text('topic_code').notNull(), categoryId: text('category_id').notNull(),
 title: text('title').notNull(), purpose: text('purpose').notNull(), steps: text('steps').notNull(), audiences: text('audiences').notNull().default('[]'),
 stepMedia: text('step_media').notNull().default('[]'),
 critical: integer('critical',{mode:'boolean'}).notNull().default(false), recommended: integer('recommended',{mode:'boolean'}).notNull().default(false),
 documentVersion: text('document_version').notNull(), state: text('state').notNull().default('draft'), changeNote: text('change_note').notNull(),
 createdBy: text('created_by').notNull(), createdAt: text('created_at').notNull(),
},t=>[index('ole_sop_topic_versions_owner_topic').on(t.ownerId,t.topicCode,t.createdAt),index('ole_sop_topic_versions_owner_state').on(t.ownerId,t.state,t.createdAt)]);
export const sopMedia = sqliteTable('ole_sop_media', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), name: text('name').notNull(), type: text('type').notNull(),
 size: integer('size').notNull(), uploadedBy: text('uploaded_by').notNull(), uploadedAt: text('uploaded_at').notNull(),
},t=>[index('ole_sop_media_owner_uploaded').on(t.ownerId,t.uploadedAt)]);
export const sopExamPlans = sqliteTable('ole_sop_exam_plans', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), title: text('title').notNull(), questionIds: text('question_ids').notNull(),
 audienceType: text('audience_type').notNull().default('all'), audienceValues: text('audience_values').notNull().default('[]'),
 scopeDepartments: text('scope_departments').notNull().default('[]'),
 startsAt: text('starts_at').notNull(), dueAt: text('due_at').notNull(), questionCount: integer('question_count').notNull(),
 passScore: integer('pass_score').notNull().default(80), retakeWaitDays: integer('retake_wait_days').notNull().default(0), status: text('status').notNull().default('draft'),
 createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
},t=>[index('ole_sop_exam_plans_owner_status').on(t.ownerId,t.status),index('ole_sop_exam_plans_owner_due').on(t.ownerId,t.dueAt)]);
export const xpRewardEvents = sqliteTable('ole_xp_reward_events', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), employeeId: text('employee_id').notNull(),
 season: integer('season').notNull(), branchId: text('branch_id'), category: text('category').notNull(), amount: integer('amount').notNull(),
 sourceType: text('source_type').notNull(), sourceId: text('source_id').notNull(), idempotencyKey: text('idempotency_key').notNull(),
 createdAt: text('created_at').notNull(), createdBy: text('created_by').notNull(),
},t=>[
 uniqueIndex('ole_xp_reward_events_owner_key').on(t.ownerId,t.idempotencyKey),
 index('ole_xp_reward_events_employee_season').on(t.ownerId,t.employeeId,t.season),
 index('ole_xp_reward_events_season_branch').on(t.ownerId,t.season,t.branchId),
 index('ole_xp_reward_events_ranking').on(t.ownerId,t.season,t.amount),
]);
export const xpAdjustmentAudit = sqliteTable('ole_xp_adjustment_audit', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), employeeId: text('employee_id').notNull(), season: integer('season').notNull(),
 category: text('category').notNull(), beforeTotal: integer('before_total').notNull(), adjustment: integer('adjustment').notNull(), afterTotal: integer('after_total').notNull(),
 reason: text('reason').notNull(), actor: text('actor').notNull(), createdAt: text('created_at').notNull(), rewardEventId: text('reward_event_id').notNull(),
},t=>[index('ole_xp_adjustment_audit_employee').on(t.ownerId,t.employeeId,t.createdAt),uniqueIndex('ole_xp_adjustment_audit_reward').on(t.ownerId,t.rewardEventId)]);
export const farmConfigs = sqliteTable('ole_farm_configs', {
 ownerId: text('owner_id').primaryKey(), config: text('config').notNull(), updatedAt: text('updated_at').notNull(), updatedBy: text('updated_by').notNull(),
});
