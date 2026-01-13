export type PricePickPayload = {
  priceText: string;
  productName: string;
  imageUrl: string;
  cssSelector: string;
  xPath: string;
  pageUrl: string;
  outerHtmlSnippet: string;
  capturedAtIso: string;
};

export type TrackedItem = PricePickPayload & {
  savedAtIso: string;
  id: string;
  lastScrapeStatus?: string;
};

export type RuntimeMessage =
  | { type: "PING_PRICE_PICKER" }
  | { type: "START_PRICE_PICK" }
  | { type: "PRICE_PICKED"; payload: PricePickPayload }
  | { type: "PRICE_PICK_CANCELLED" }
  | { type: "TRACKED_ITEM_SAVED"; item: TrackedItem };

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "price_drop" | string;
  productId?: string;
  oldPrice?: string;
  newPrice?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

export interface TrackedItemWithDrop extends TrackedItem {
  hasUnreadPriceDrop?: boolean;
  previousPrice?: string;
}
