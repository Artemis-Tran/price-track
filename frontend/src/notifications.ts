import type { Notification } from "./types";

const API_BASE = process.env.API_BASE_URL;

export async function fetchNotifications(
  authToken: string
): Promise<Notification[]> {
  const response = await fetch(`${API_BASE}/notifications`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized");
    }
    throw new Error(`Failed to fetch notifications: ${response.status}`);
  }

  return response.json();
}

export async function markNotificationRead(
  authToken: string,
  notificationId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/notifications/${notificationId}/read`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized");
    }
    throw new Error(`Failed to mark notification as read: ${response.status}`);
  }
}

export function getUnreadNotifications(
  notifications: Notification[]
): Notification[] {
  return notifications.filter((n) => !n.isRead);
}

export function getUnreadPriceDropByProduct(
  notifications: Notification[]
): Map<string, Notification> {
  const map = new Map<string, Notification>();

  for (const n of notifications) {
    if (n.type === "price_drop" && !n.isRead && n.productId) {
      // Keep the most recent one (first in the array since sorted by created_at DESC)
      if (!map.has(n.productId)) {
        map.set(n.productId, n);
      }
    }
  }

  return map;
}

export function formatNotificationTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
