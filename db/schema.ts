import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const spaces=sqliteTable('spaces',{uid:text('uid').primaryKey(),version:integer('version').notNull().default(0),state:text('state').notNull(),updated:integer('updated').notNull()});
export const limits=sqliteTable('rate_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
export const devices=sqliteTable('devices',{token:text('token').primaryKey(),uid:text('uid').notNull(),session:text('session').notNull(),updated:integer('updated').notNull()});
export const deliveries=sqliteTable('deliveries',{key:text('key').primaryKey(),status:text('status').notNull(),updated:integer('updated').notNull()});
export const assets=sqliteTable('assets',{id:text('id').primaryKey(),uid:text('uid').notNull(),mime:text('mime').notNull()});
export const operations=sqliteTable('operations',{uid:text('uid').notNull(),id:text('id').notNull(),version:integer('version').notNull()},t=>[primaryKey({columns:[t.uid,t.id]})]);
