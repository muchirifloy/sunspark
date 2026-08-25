export type UserRole = "ADMIN" | "STAFF" | "CUSTOMER";

export type OrderStatus = "PENDING" | "CONFIRMED" | "PROCESSING" | "READY" | "COMPLETED" | "CANCELLED";
export type PaymentMethod = "WHATSAPP" | "MPESA" | "CASH";
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type SellingUnit = "UNIT" | "METRE" | "ROLL" | "CARTON" | "BOX" | "PACK" | "PAIR" | "SET" | "LITRE" | "KILOGRAM";
export type DraftInvoiceKind = "INVOICE" | "QUOTATION";
export type DraftInvoiceStatus = "DRAFT" | "COMPLETED" | "CANCELLED";

export type CategoryImage = {
  id: string;
  categoryId: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string | Date;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  productCount: number;
  images: CategoryImage[];
  products: Product[];
  children: Category[];
};

export type ProductImage = {
  id: string;
  productId: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string | Date;
};

export type ProductOption = {
  id: string;
  productId: string;
  label: string;
  sellingUnit: SellingUnit;
  priceCents: number;
  compareAtCents: number | null;
  costCents: number;
  stockMultiplier: number;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

/**
 * The shape the walk-in / invoice / quotation product picker actually renders.
 * Kept separate from Product so the admin forms are not handed description
 * HTML, SEO columns, a nested category and every image row for the whole
 * catalogue just to draw a name, a price and a stock count.
 */
export type SaleProduct = {
  id: string;
  name: string;
  priceCents: number;
  stockQuantity: number;
  options: ProductOption[];
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  shortDescription: string | null;
  description: string | null;
  priceCents: number;
  compareAtCents: number | null;
  costCents: number;
  sellingUnit: SellingUnit;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  isFeatured: boolean;
  isHotDeal: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  categoryId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  category: Category;
  images: ProductImage[];
  options: ProductOption[];
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  createdAt?: string | Date;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string | null;
  productOptionId: string | null;
  productName: string;
  optionLabel: string | null;
  sellingUnit: SellingUnit;
  unitCents: number;
  /**
   * Catalogue price at the time of sale. Null on lines recorded before
   * negotiated pricing existed, and equal to unitCents when nothing was
   * negotiated. A difference means the price was agreed for that sale alone --
   * the product's own price is never changed by it.
   */
  listPriceCents?: number | null;
  costCents: number;
  quantity: number;
  totalCents: number;
  stockDeducted?: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  deliveryNote: string | null;
  deliveryLocation: string | null;
  deliveryMapUrl: string | null;
  deliveryLatitude: string | null;
  deliveryLongitude: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotalCents: number;
  totalCents: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  items: OrderItem[];
  invoice?: Invoice | null;
};

export type Invoice = {
  id: string;
  orderId: string;
  invoiceNumber: string;
  issuedAt: string | Date;
};

export type Campaign = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  badge: string | null;
  offerLabel: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  isActive: boolean;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};
