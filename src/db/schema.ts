import { pgTable, uuid, text, integer, timestamp, numeric, pgEnum, date, unique, index } from "drizzle-orm/pg-core";

export const wineColor = pgEnum("wine_color", ["rouge", "blanc", "rose", "effervescent"]);
export const cellarStatus = pgEnum("cellar_status", ["in_cellar", "drunk"]);
export const storageKind = pgEnum("storage_kind", ["grid", "diamond"]);

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
  lwinCode: text("lwin_code"),
  drinkFrom: integer("drink_from"),
  drinkTo: integer("drink_to"),
  drinkWindowConfidence: numeric("drink_window_confidence", { precision: 3, scale: 2 }),
  drinkWindowSource: text("drink_window_source"),
  drinkWindowFetchedAt: timestamp("drink_window_fetched_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqWine: unique("uniq_wine").on(t.producer, t.cuvee, t.vintage).nullsNotDistinct(),
}));

export const lwinWines = pgTable("lwin_wines", {
  lwin: text("lwin").primaryKey(),
  displayName: text("display_name"),
  producer: text("producer"),
  wine: text("wine"),
  region: text("region"),
  country: text("country"),
  colour: text("colour"),
  type: text("type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
}, (t) => ({
  uniqUserWine: unique("uniq_user_wine").on(t.userId, t.wineId),
}));

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

export const wineImages = pgTable("wine_images", {
  wineId: uuid("wine_id").primaryKey().references(() => wines.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  mime: text("mime").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const storageUnits = pgTable("storage_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: storageKind("kind").notNull(),
  cols: integer("cols"),
  rows: integer("rows"),
  gridX: integer("grid_x").notNull().default(0),
  gridY: integer("grid_y").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const placements = pgTable("placements", {
  id: uuid("id").primaryKey().defaultRandom(),
  cellarItemId: uuid("cellar_item_id").notNull().references(() => cellarItems.id, { onDelete: "cascade" }),
  unitId: uuid("unit_id").notNull().references(() => storageUnits.id, { onDelete: "cascade" }),
  compartment: text("compartment").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  byItem: index("placements_item_idx").on(t.cellarItemId),
  byUnit: index("placements_unit_idx").on(t.unitId),
  uniqSlot: unique("uniq_placement_slot").on(t.cellarItemId, t.unitId, t.compartment),
}));
