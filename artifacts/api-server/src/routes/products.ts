import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateProductBody,
  CreateProductResponse,
  DeleteProductParams,
  ListProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { db, productsTable, storeMetaTable } from "@workspace/db";

const router: IRouter = Router();

const seedProducts = [
  {
    name: "بروجكتور رائد الفضاء",
    description: "إضاءة مجرية بألوان متبدلة لغرفة مختلفة",
    price: 6900,
    category: "جو الغرفة",
    stock: 12,
    art: "ring",
    image: "/astronaut-projector.webp",
    featured: true,
    priceVisible: true,
    stockVisible: true,
    promotion: "الأكثر طلباً",
  },
  {
    name: "شريط LED RGB",
    description: "ألوان متعددة مع ريموت للتحكم في كل زاوية",
    price: 5400,
    category: "LED",
    stock: 8,
    art: "tube",
    image: "/led-strip.jpg",
    featured: true,
    priceVisible: true,
    stockVisible: true,
    promotion: "جديد",
  },
  {
    name: "سِراج ناعم",
    description: "إضاءة جانبية بوهج دافئ وملمس أنيق",
    price: 3800,
    category: "جانبية",
    stock: 20,
    art: "pendant",
    image: null,
    featured: true,
    priceVisible: true,
    stockVisible: true,
    promotion: null,
  },
  {
    name: "كُتلة ضوء",
    description: "مصباح سقفي هندسي لغرفة المعيشة",
    price: 8900,
    category: "سقفية",
    stock: 5,
    art: "square",
    image: null,
    featured: true,
    priceVisible: true,
    stockVisible: true,
    promotion: null,
  },
  {
    name: "نبض صغير",
    description: "قطعة مدمجة لزاوية القراءة أو الطاولة",
    price: 2900,
    category: "جانبية",
    stock: 17,
    art: "ring",
    image: null,
    featured: false,
    priceVisible: true,
    stockVisible: true,
    promotion: null,
  },
  {
    name: "شعاع هادئ",
    description: "إضاءة عملية للممرات وغرف النوم",
    price: 4700,
    category: "حوائط",
    stock: 9,
    art: "tube",
    image: null,
    featured: false,
    priceVisible: true,
    stockVisible: true,
    promotion: null,
  },
] as const;

async function getProducts() {
  let products = await db.select().from(productsTable);
  if (products.length > 0) {
    await db
      .insert(storeMetaTable)
      .values({ key: "catalog_seeded", value: "true" })
      .onConflictDoNothing();
    return products;
  }

  const [seedMarker] = await db
    .select({ key: storeMetaTable.key })
    .from(storeMetaTable)
    .where(eq(storeMetaTable.key, "catalog_seeded"));
  if (seedMarker) return products;

  products = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('glowstore:catalog-seed'))`,
    );
    const current = await tx.select().from(productsTable);
    if (current.length > 0) return current;

    const [alreadySeeded] = await tx
      .select({ key: storeMetaTable.key })
      .from(storeMetaTable)
      .where(eq(storeMetaTable.key, "catalog_seeded"));
    if (alreadySeeded) return current;

    const seeded = await tx
      .insert(productsTable)
      .values([...seedProducts])
      .returning();
    await tx
      .insert(storeMetaTable)
      .values({ key: "catalog_seeded", value: "true" });
    return seeded;
  });
  return products;
}

router.get("/products", async (req, res): Promise<void> => {
  const products = await getProducts();
  req.log.info({ count: products.length }, "Fetched product catalog");
  res.json(ListProductsResponse.parse(products));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid product body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      ...parsed.data,
      image: parsed.data.image ?? null,
      promotion: parsed.data.promotion ?? null,
      featured: parsed.data.featured ?? false,
      priceVisible: parsed.data.priceVisible ?? true,
      stockVisible: parsed.data.stockVisible ?? true,
    })
    .returning();

  req.log.info({ productId: product.id }, "Created product");
  res.status(201).json(CreateProductResponse.parse(product));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid product update");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .update(productsTable)
    .set({
      ...parsed.data,
      image: parsed.data.image ?? null,
      promotion: parsed.data.promotion ?? null,
      featured: parsed.data.featured ?? false,
      priceVisible: parsed.data.priceVisible ?? true,
      stockVisible: parsed.data.stockVisible ?? true,
    })
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  req.log.info({ productId: product.id }, "Updated product");
  res.json(UpdateProductResponse.parse(product));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .returning({ id: productsTable.id });

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  req.log.info({ productId: product.id }, "Deleted product");
  res.sendStatus(204);
});

export default router;