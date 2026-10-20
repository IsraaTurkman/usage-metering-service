import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  boolean,
  uniqueIndex,
  check,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

// Plan types
export const planTypeEnum = pgEnum("plan_type", [
  "account",
  "user",
]);

// Plans table
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: varchar("name", { length: 100 }).notNull(),

    type: planTypeEnum("type").notNull(),

    ownerAccountId: uuid("owner_account_id")
  .references((): AnyPgColumn => accounts.id),

    monthlyAllowance: integer("monthly_allowance").notNull(),

    maxUnitsPerRequest: integer("max_units_per_request").notNull(),

    isPredefined: boolean("is_predefined").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "plans_monthly_allowance_positive",
      sql`${table.monthlyAllowance} > 0`,
    ),
    check(
      "plans_max_units_positive",
      sql`${table.maxUnitsPerRequest} > 0`,
    ),
  ],
);

// Accounts table
export const accounts = pgTable("accounts", {
    
  id: uuid("id").primaryKey().defaultRandom(),
  

  name: varchar("name", { length: 150 }).notNull(),

  apiKeyHash: varchar("api_key_hash", { length: 64 })
    .notNull()
    .unique(),

  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});



// Users table
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),

    externalId: varchar("external_id", { length: 150 }).notNull(),

    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_account_external_unique").on(
      table.accountId,
      table.externalId,
    ),
  ],
);


// Account monthly usage
export const accountUsage = pgTable(
  "account_usage",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),

    month: varchar("month", { length: 7 }).notNull(),

    consumedUnits: integer("consumed_units")
      .notNull()
      .default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.accountId, table.month],
    }),
    check(
      "account_usage_nonnegative",
      sql`${table.consumedUnits} >= 0`,
    ),
  ],
);

// User monthly usage
export const userUsage = pgTable(
  "user_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    month: varchar("month", { length: 7 }).notNull(),

    consumedUnits: integer("consumed_units")
      .notNull()
      .default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.month],
    }),
    check(
      "user_usage_nonnegative",
      sql`${table.consumedUnits} >= 0`,
    ),
  ],
);

// Request history
export const usageRequests = pgTable(
  "usage_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    requestId: varchar("request_id", { length: 150 })
      .notNull(),

    units: integer("units").notNull(),

    accepted: boolean("accepted").notNull(),

    rejectionLevel: varchar("rejection_level", {
      length: 20,
    }),

    rejectionRule: varchar("rejection_rule", {
      length: 100,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("usage_requests_account_request_unique").on(
      table.accountId,
      table.requestId,
    ),

    check(
      "usage_requests_units_positive",
      sql`${table.units} > 0`,
    ),
  ],
);