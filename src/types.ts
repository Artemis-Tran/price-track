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
  userNotes: string;
  savedAtIso: string;
  id: string;
};

export type RuntimeMessage =
  | { type: "PING_PRICE_PICKER" }
  | { type: "START_PRICE_PICK" }
  | { type: "PRICE_PICKED"; payload: PricePickPayload }
  | { type: "PRICE_PICK_CANCELLED" }
  | { type: "TRACKED_ITEM_SAVED"; item: TrackedItem };
