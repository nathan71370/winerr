import { pgTable, uuid, text, integer, timestamp, numeric, pgEnum, date, unique } from "drizzle-orm/pg-core";

export const wineColor = pgEnum("wine_color", ["rouge", "blanc", "rose", "effervescent"]);
export const cellarStatus = pgEnum("cellar_status", ["in_cellar", "drunk"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const wines = pgTable("wines", {
  id: uuid("id").primaryKey().defaultRandom(),
  producer: text("producer").notNull(),
  cuvee: text("cuvee"),
  vintage: integer("vintage"),
  region: text("region"),
  country: text("country"),
  color: wineColor("color"),
  grapes: text("grapes"),
  refLabelImage: text("ref_label_image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqWine: unique("uniq_wine").on(t.producer, t.cuvee, t.vintage),
}));

export const cellarItems = pgTable("cellar_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wineId: uuid("wine_id").notNull().references(() => wines.id),
  quantity: integer("quantity").notNull().default(1),
  purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }),
  purchaseDate: date("purchase_date"),
  drinkFrom: integer("drink_from"),
  drinkBefore: integer("drink_before"),
  location: text("location"),
  myPhoto: text("my_photo"),
  status: cellarStatus("status").notNull().default("in_cellar"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wineId: uuid("wine_id").notNull().references(() => wines.id),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  tastingNote: text("tasting_note"),
  tastedAt: date("tasted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const priceSnapshots = pgTable("price_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  wineId: uuid("wine_id").notNull().references(() => wines.id),
  estimate: numeric("estimate", { precision: 10, scale: 2 }),
  low: numeric("low", { precision: 10, scale: 2 }),
  high: numeric("high", { precision: 10, scale: 2 }),
  currency: text("currency").notNull().default("EUR"),
  source: text("source"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});
